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
$cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
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

// смета: не больше 100 строк; цены — как их видел посетитель (в BYN), только для справки менеджеру
$items = [];
$sum = 0;
foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 100) as $it) {
    if (!is_array($it)) continue;
    $q = max(1, min(9999, (int) ($it['q'] ?? 1)));
    $b = is_numeric($it['b'] ?? null) ? (int) $it['b'] : null;
    if ($b !== null) $sum += $b * $q;
    $items[] = '• ' . $clean($it['a'] ?? '', 60) . ' — ' . $clean($it['n'] ?? '', 160) . ' × ' . $q
        . ($b !== null ? ' = ' . number_format($b * $q, 0, ',', ' ') . ' BYN' : ' (по запросу)');
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

$text = implode("\n", array_filter([
    'Заявка с сайта hdl.by' . ($lead['topic'] ? ': ' . $lead['topic'] : ''),
    $lead['name'] ? 'Имя: ' . $lead['name'] : '',
    'Телефон: ' . $lead['phone'],
    $lead['comment'] ? 'Комментарий: ' . $lead['comment'] : '',
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
    curl_close($ch);
    $res = json_decode((string) $raw, true);
    $sent = !empty($res['ok']);
    // причина неудачи — в журнал рядом с заявками (без токена), чтобы было видно, почему не дошло
    if (!$sent) @file_put_contents($dir . '/tg-errors.log', date('Y-m-d H:i:s') . ' ' . ($err ?: mb_substr((string) $raw, 0, 300)) . "\n", FILE_APPEND);
} else {
    @file_put_contents($dir . '/tg-errors.log', date('Y-m-d H:i:s') . " в config.php нет tg_token или tg_chat\n", FILE_APPEND);
}
if (!$sent && !empty($cfg['mail_to'])) {
    $sent = mail($cfg['mail_to'], '=?UTF-8?B?' . base64_encode('Заявка с сайта hdl.by') . '?=', $text,
        "Content-Type: text/plain; charset=utf-8\r\n");
}

// заявка не потеряна, если сохранена в файл или доставлена
reply($saved || $sent ? 200 : 500, ['ok' => $saved || $sent]);
