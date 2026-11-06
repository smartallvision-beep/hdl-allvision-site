<?php
// Приём заявки с формы hdl.by: проверка, копия в CSV вне папки сайта, отправка в Telegram (и на почту, если задана).
// Устроено как lead.php сайта AOKOL. Настройки — в config.php рядом (образец: config.example.php). Токен бота в код не вписывать.
declare(strict_types=1);
// предупреждения PHP — только в журнал ошибок: любой текст в ответе ломает разбор ответа на сайте
ini_set('display_errors', '0');
ob_start();
header('Content-Type: application/json; charset=utf-8');

function reply(int $code, array $body): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['ok' => false]);
// config.php правят руками на сервере: опечатка в нём не должна терять заявку, она уходит в CSV, причина — в журнал
$cfg = [];
$cfgErr = '';
$cfgFile = getenv('HDL_CONFIG') ?: __DIR__ . '/config.php';  // HDL_CONFIG — только для проверки на компьютере
if (is_file($cfgFile)) {
    try {
        $cfg = require $cfgFile;
    } catch (Throwable $e) {
        $cfgErr = 'ошибка в config.php, строка ' . $e->getLine() . ': ' . $e->getMessage();
    }
    if (!is_array($cfg)) $cfg = [];
}
$cfg = array_map(fn($v) => is_string($v) ? trim($v) : $v, $cfg);
$in = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) reply(400, ['ok' => false]);

// скрытое поле заполняют только боты: отвечаем «принято» и ничего не делаем
if (trim((string) ($in['website'] ?? '')) !== '') reply(200, ['ok' => true]);

$clean = fn($v, int $max) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string) $v)), 0, $max);
$lead = [
    'name' => $clean($in['name'] ?? '', 80), 'phone' => $clean($in['phone'] ?? '', 40),
    'topic' => $clean($in['topic'] ?? '', 120), 'page' => $clean($in['page'] ?? '', 200),
    'comment' => $clean($in['comment'] ?? '', 1000),
];
if (preg_match_all('/\d/', $lead['phone']) < 7) reply(422, ['ok' => false, 'error' => 'phone']);
if (empty($in['consent'])) reply(422, ['ok' => false, 'error' => 'consent']);

// смета: не больше 100 строк; цены — как их видел посетитель (в BYN), только для справки менеджеру. Смета от сотрудника — со своей
// скидкой (sdisc, вместо личной) и названием документа; оба только для справки, цены посетитель видел уже с ней
$sdisc = is_numeric($in['sdisc'] ?? null) ? max(0.0, min(50.0, round((float) $in['sdisc'], 1))) : null;
$doc = $clean($in['doc'] ?? '', 80);
$pct = fn(float $d) => rtrim(rtrim(number_format($d, 1, ',', ''), '0'), ',') . ' %';
$items = [];
$rows = [];  // те же строки для кабинета
$sum = 0;
foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 100) as $it) {
    if (!is_array($it)) continue;
    $q = max(1, min(9999, (int) ($it['q'] ?? 1)));
    $b = is_numeric($it['b'] ?? null) ? (int) $it['b'] : null;
    if ($b !== null) $sum += $b * $q;
    $items[] = '• ' . $clean($it['a'] ?? '', 60) . ' — ' . $clean($it['n'] ?? '', 160) . ' × ' . $q
        . ($b !== null ? ' = ' . number_format($b * $q, 0, ',', ' ') . ' BYN' : ' (по запросу)');
    $rows[] = ['a' => $clean($it['a'] ?? '', 60), 'n' => $clean($it['n'] ?? '', 160), 'q' => $q, 'b' => $b];
}

// данные — вне папки сайта, чтобы файл заявок нельзя было скачать по ссылке
$dir = $cfg['data_dir'] ?? dirname(__DIR__) . '/hdl-data';
if (!is_dir($dir)) @mkdir($dir, 0750, true);

// не больше 10 заявок за 10 минут с одного адреса
$rl = $dir . '/rl_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
$times = array_filter(array_map('intval', is_file($rl) ? file($rl) : []), fn($t) => $t > time() - 600);
if (count($times) >= 10) reply(429, ['ok' => false, 'error' => 'rate']);
$times[] = time();
@file_put_contents($rl, implode("\n", $times));

$saved = false;
if ($fh = @fopen($dir . '/leads.csv', 'a')) {
    $saved = fputcsv($fh, array_merge([date('Y-m-d H:i:s')], array_values($lead), [implode(' | ', $items)]), ',', '"', '\\') !== false;
    fclose($fh);
}

// заявка — и в кабинет (kab.php): сотрудник видит все заявки, вошедший посетитель — свои. Сбой базы заявку не теряет: она в CSV и в Telegram
$who = null;
$leadNo = 0;
try {
    require_once __DIR__ . '/_kab.php';
    $who = kab_user();
    // состав для «Открыть» в кабинете (владелец 06.11.2026): количество — из запроса; скидки по строкам, свои строки и скидку сметы берём
    // только у сотрудника или из базы — из сметы (sid) или заявки (lid) этого же человека, которые подготовил сотрудник; иначе — без них
    $smIn = is_array($in['sm'] ?? null) ? $in['sm'] : [];
    $smStaff = kab_is_staff($who);
    $smSt = kab_sm_clean($smIn, $smStaff);
    $smD = $smStaff ? kab_disc($smIn['d'] ?? null) : null;
    if ($who && !$smStaff) {
        $src = null;
        if ($sid = (int) ($smIn['sid'] ?? 0)) {
            $q = kab_db()->prepare('SELECT ld, extra, disc FROM smetas WHERE id = ? AND user_id = ?');
            $q->execute([$sid, $who['id']]);
            if ($r = $q->fetch()) $src = ['ld' => json_decode((string) $r['ld'], true), 'extra' => json_decode((string) $r['extra'], true), 'd' => $r['disc']];
        } elseif ($lid = (int) ($smIn['lid'] ?? 0)) {
            $q = kab_db()->prepare('SELECT sm FROM leads WHERE id = ? AND user_id = ?');
            $q->execute([$lid, $who['id']]);
            if ($r = json_decode((string) $q->fetchColumn(), true)) $src = ['ld' => $r['ld'] ?? [], 'extra' => $r['extra'] ?? [], 'd' => $r['d'] ?? null];
        }
        if ($src) {
            $smSt = kab_sm_clean(['items' => $smSt['items'], 'ld' => $src['ld'], 'extra' => $src['extra']], true);
            $smD = kab_disc($src['d']);
        }
    }
    $smJson = $smSt['items'] || $smSt['extra'] ? json_encode($smSt + ['d' => $smD, 'doc' => kab_doc($doc)], JSON_UNESCAPED_UNICODE) : '';
    kab_db()->prepare('INSERT INTO leads (user_id, created_at, name, phone, topic, page, comment, items, total, status, sm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$who ? $who['id'] : null, date('Y-m-d H:i:s'), $lead['name'], $lead['phone'], $lead['topic'], $lead['page'], $lead['comment'],
            json_encode($rows, JSON_UNESCAPED_UNICODE), $rows ? $sum : null, 'new', $smJson]);
    $leadNo = (int) kab_db()->lastInsertId();
    $saved = true;
} catch (Throwable $e) {
    @file_put_contents($dir . '/kab-errors.log', date('Y-m-d H:i:s') . ' заявка в базу: ' . $e->getMessage() . "\n", FILE_APPEND);
}

$text = implode("\n", array_filter([
    'Заявка' . ($leadNo ? ' №' . $leadNo : '') . ' с сайта hdl.by' . ($lead['topic'] ? ': ' . $lead['topic'] : ''),
    $who ? 'Из кабинета: ' . (array_key_exists($who['role'], KAB_ROLE_NAME) ? KAB_ROLE_NAME[$who['role']] : $who['role']) . ($who['company'] ? ', ' . $who['company'] : '')
        . ($sdisc === null && (float) $who['discount'] > 0 ? ', скидка ' . $pct((float) $who['discount']) . ' (цены в смете — с ней)' : '')
        . ($who['tg_username'] ? ', @' . $who['tg_username'] : '') : '',
    $lead['name'] ? 'Имя: ' . $lead['name'] : '',
    'Телефон: ' . $lead['phone'],
    $lead['comment'] ? 'Комментарий: ' . $lead['comment'] : '',
    $items && ($doc !== '' || $sdisc !== null) ? ($doc !== '' ? $doc : 'Смета') . ($sdisc !== null ? ', скидка в смете ' . $pct($sdisc) . ' (цены ниже — уже со скидками, в строках может быть своя)' : '') : '',
    $items ? "Смета:\n" . implode("\n", $items) . "\nИтого: " . number_format($sum, 0, ',', ' ') . ' BYN' : '',
    $lead['page'] ? 'Страница: ' . $lead['page'] : '',
]));
if (mb_strlen($text) > 4000) $text = mb_substr($text, 0, 3990) . '…';  // предел сообщения Telegram

$sent = false;
if (!empty($cfg['tg_token']) && !empty($cfg['tg_chat'])) {
    $ch = curl_init('https://api.telegram.org/bot' . $cfg['tg_token'] . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_POSTFIELDS => ['chat_id' => $cfg['tg_chat'], 'text' => $text],
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    if (PHP_VERSION_ID < 80000) curl_close($ch);  // с PHP 8.0 не нужен, в 8.5 устарел
    $res = json_decode((string) $raw, true);
    $sent = !empty($res['ok']);
    // причина неудачи — в журнал рядом с заявками (без токена), чтобы было видно, почему не дошло
    if (!$sent) @file_put_contents($dir . '/tg-errors.log', date('Y-m-d H:i:s') . ' ' . ($err ?: mb_substr((string) $raw, 0, 300)) . "\n", FILE_APPEND);
} else {
    @file_put_contents($dir . '/tg-errors.log', date('Y-m-d H:i:s') . ' ' . ($cfgErr ?: 'в config.php нет tg_token или tg_chat') . "\n", FILE_APPEND);
}
if (!$sent && !empty($cfg['mail_to'])) {
    $sent = mail($cfg['mail_to'], '=?UTF-8?B?' . base64_encode('Заявка с сайта hdl.by') . '?=', $text,
        "Content-Type: text/plain; charset=utf-8\r\n");
}

// заявка не потеряна, если сохранена в файл или доставлена
reply($saved || $sent ? 200 : 500, ['ok' => $saved || $sent]);
