<?php
// Кабинет hdl.by: вход через Telegram, анкета, роли (клиент, дилер, сотрудник), скидка, сметы и заявки. Страница /kabinet/ и скрипт сайта
// обращаются сюда: kab.php?a=<действие>. Изменения — только POST с заголовком X-HDL: 1 (чужой сайт такой запрос не пошлёт).
declare(strict_types=1);
ini_set('display_errors', '0');  // предупреждения — в журнал: любой текст в ответе ломает разбор ответа на сайте
ob_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require __DIR__ . '/_kab.php';

function reply(int $code, array $body): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function pub(?array $u): ?array {
    if (!$u) return null;
    return ['id' => (int) $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'company' => $u['company'], 'unp' => $u['unp'],
        'role' => $u['role'], 'wanted' => $u['wanted'], 'discount' => (float) $u['discount'], 'status' => $u['status'],
        'tg_username' => $u['tg_username'], 'tg_name' => $u['tg_name']];
}

$a = (string) ($_GET['a'] ?? '');
$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
if ($post && ($_SERVER['HTTP_X_HDL'] ?? '') !== '1') reply(403, ['ok' => false, 'error' => 'header']);
$in = $post ? (in_array($a, ['upload', 'cat_set'], true) ? $_POST : json_decode((string) file_get_contents('php://input'), true)) : $_GET;  // загрузка файла и правка с фото — форма, остальное — JSON
if (!is_array($in)) reply(400, ['ok' => false]);

try {
    $db = kab_db();
} catch (Throwable $e) {
    kab_log('база: ' . $e->getMessage());
    reply(503, ['ok' => false, 'error' => 'db']);
}
$me = kab_user();
$staff = kab_is_staff($me);
$admin = kab_is_admin($me);
$need = function (bool $cond, int $code = 403) { if (!$cond) reply($code, ['ok' => false, 'error' => 'access']); };

// заявки и сметы — одни строки для вкладок и карточки клиента (поиск, владелец 06.11.2026)
// заявка: sm — состав для «Открыть» (у старых заявок пусто: собирается из строк items); edited_at — правил сотрудник, made — оформил сотрудник;
// сотруднику ещё кто правил и оформил, как прислал клиент (items0, total0) и личная скидка клиента (udisc)
// ver — номер версии для проверки «уже изменил другой»; note — заметка для своих (клиенту не отдаётся)
// paid — сумма приходных ордеров по заявке (07.11.2026): сотруднику отдаётся только состояние оплаты (pay), суперадмину ещё сумма
$leadSql = 'SELECT l.id, l.user_id, l.created_at, l.name, l.phone, l.topic, l.page, l.comment, l.items, l.total, l.status, l.status_at, l.sm, l.items0, l.total0, l.edited_at, l.made_by, l.ver, l.note,
    (SELECT COALESCE(SUM(p.to_lead), 0) FROM pays p WHERE p.lead_id = l.id AND p.deleted_at IS NULL) AS paid,
    u.role, u.company, u.tg_username, u.discount AS udisc, e.name AS edited_name, e.tg_name AS edited_tg, mk.name AS made_name, mk.tg_name AS made_tg
    FROM leads l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users e ON e.id = l.edited_by LEFT JOIN users mk ON mk.id = l.made_by';
$leadRow = function (array $r) use ($staff, $admin): array {
    $r['sm'] = json_decode((string) $r['sm']) ?: null;
    // состав, записанный до 06.11.2026 с пустыми items или ld как [] — отдаём объектами, иначе страница теряет скидки в строках
    if ($r['sm'] instanceof stdClass) {
        foreach (['items', 'ld'] as $k) $r['sm']->$k = (object) ($r['sm']->$k ?? []);
        $r['sm']->ld = (object) array_intersect_key((array) $r['sm']->ld, (array) $r['sm']->items);  // скидки убранных позиций не отдаём
    }
    $r['id'] = (int) $r['id'];
    $r['user_id'] = $r['user_id'] === null ? null : (int) $r['user_id'];
    $r['udisc'] = $r['udisc'] === null ? null : (float) $r['udisc'];
    $r['total'] = $r['total'] === null ? null : (float) $r['total'];  // с копейками, если они есть у своих строк
    // оплата: paid — оплачен, part — частично, none — не оплачен, nosum — у заявки нет суммы и оплат нет
    $paid = round((float) $r['paid'], 2);
    unset($r['paid']);
    if ($staff) $r['pay'] = $paid <= 0 ? ((float) $r['total'] > 0 ? 'none' : 'nosum') : ((float) $r['total'] > 0 && $paid + 0.005 < (float) $r['total'] ? 'part' : 'paid');
    if ($admin) $r['paid'] = $paid;
    $r['ver'] = (int) $r['ver'];
    $r['note'] = (string) $r['note'];
    $r['edited_name'] = $r['edited_at'] ? ($r['edited_name'] ?: $r['edited_tg']) : null;
    $r['made'] = $r['made_by'] !== null;
    $r['made_name'] = $r['made'] ? ($r['made_name'] ?: $r['made_tg']) : null;
    unset($r['edited_tg'], $r['made_tg'], $r['made_by']);
    if (!$staff) unset($r['role'], $r['company'], $r['tg_username'], $r['udisc'], $r['items0'], $r['total0'], $r['edited_name'], $r['made_name'], $r['note']);
    return $r;
};
// деньги клиента (07.11.2026): ключи — пользователь кабинета и его телефон (заявки без входа с того же номера); первый ключ — основной
$payKeys = function (string $ck) use ($db): array {
    if (preg_match('/^u(\d+)$/', $ck, $m)) {
        $q = $db->prepare('SELECT id, phone FROM users WHERE id = ?');
        $q->execute([(int) $m[1]]);
        $u = $q->fetch();
        if (!$u) return [];
        $pk = kab_phone_key($u['phone']);
        return $pk !== '' ? ['u' . $u['id'], 't' . $pk] : ['u' . $u['id']];
    }
    if (preg_match('/^t(\d{7,9})$/', $ck, $m)) {
        foreach ($db->query('SELECT id, phone FROM users') as $u) if (kab_phone_key($u['phone']) === $m[1]) return ['u' . $u['id'], $ck];
        return [$ck];
    }
    return [];
};
$payBal = function (array $keys) use ($db): float {  // баланс: приходные сверх заказов минус зачёты и выдачи
    if (!$keys) return 0.0;
    $q = $db->prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount - to_lead ELSE -amount END), 0) FROM pays WHERE deleted_at IS NULL AND ckey IN ("
        . implode(',', array_fill(0, count($keys), '?')) . ')');
    $q->execute($keys);
    return round((float) $q->fetchColumn(), 2);
};
$payLead = function (int $id) use ($db, $payKeys): ?array {  // заказ: сумма, оплачено, чьи деньги
    $q = $db->prepare('SELECT l.id, l.user_id, l.phone, l.total, (SELECT COALESCE(SUM(p.to_lead), 0) FROM pays p WHERE p.lead_id = l.id AND p.deleted_at IS NULL) AS paid FROM leads l WHERE l.id = ?');
    $q->execute([$id]);
    $l = $q->fetch();
    if (!$l) return null;
    $keys = $payKeys($l['user_id'] !== null ? 'u' . (int) $l['user_id'] : 't' . kab_phone_key($l['phone']));
    $tot = (float) $l['total'];
    return ['id' => (int) $l['id'], 'total' => $tot, 'left' => $tot > 0 ? max(0.0, round($tot - (float) $l['paid'], 2)) : null, 'keys' => $keys];
};
$payIns = function (string $kind, string $on, int $lid, float $amt, float $to, string $ck, string $note) use ($db, $me): string {  // номер ПО/ЗА/ВК-ГГГГ-NNN
    $y = (int) substr($on, 0, 4);
    $db->beginTransaction();
    $q = $db->prepare('SELECT COALESCE(MAX(seq), 0) + 1 FROM pays WHERE year = ? AND kind = ?');
    $q->execute([$y, $kind]);
    $seq = (int) $q->fetchColumn();
    $num = sprintf('%s-%d-%03d', ['in' => 'ПО', 'alloc' => 'ЗА', 'out' => 'ВК'][$kind], $y, $seq);
    $db->prepare('INSERT INTO pays (num, year, seq, kind, lead_id, amount, to_lead, ckey, paid_on, note, made_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$num, $y, $seq, $kind, $lid, $amt, $to, $ck, $on, kab_clean($note, 300), $me['id'], kab_now()]);
    $db->commit();
    return $num;
};
$payIn = function (array $in): array {  // сумма и дата из формы: «1 250,50», дата ГГГГ-ММ-ДД (иначе сегодня)
    $amt = round((float) str_replace([' ', "\u{a0}", ','], ['', '', '.'], (string) ($in['amount'] ?? '0')), 2);
    $on = (string) ($in['date'] ?? '');
    if (!preg_match('/^(20\d\d)-(\d\d)-(\d\d)$/', $on, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) $on = date('Y-m-d');
    if ($amt <= 0 || $amt > 100000000) reply(422, ['ok' => false, 'error' => 'amount']);
    return [$amt, $on];
};

// смета: правил сотрудник — ему кто, клиенту — что AllVision. udisc — личная скидка владельца сметы: сотрудник, открыв чужую смету, видит его цены
$smetaSql = 'SELECT s.id, s.user_id, s.title, s.doc, s.disc, s.made_by, s.items, s.ld, s.extra, s.updated_at, s.edited_at, s.ver, s.project, u.name, u.tg_name, u.company, u.role, u.discount AS udisc,
    m.name AS made_name, m.tg_name AS made_tg, e.name AS edited_name, e.tg_name AS edited_tg
    FROM smetas s JOIN users u ON u.id = s.user_id LEFT JOIN users m ON m.id = s.made_by LEFT JOIN users e ON e.id = s.edited_by';
$smetaRow = function (array $r) use ($staff): array {
    $r['edited_name'] = $staff && $r['edited_at'] ? ($r['edited_name'] ?: $r['edited_tg']) : null;
    $r['name'] = $r['name'] ?: $r['tg_name'];
    $r['udisc'] = $staff ? (float) $r['udisc'] : null;
    unset($r['edited_tg'], $r['tg_name']);
    $r['items'] = json_decode((string) $r['items']) ?: new stdClass();
    $r['ld'] = (object) array_intersect_key((array) (json_decode((string) $r['ld']) ?: []), (array) $r['items']);  // скидки убранных позиций не отдаём
    $r['extra'] = json_decode((string) $r['extra'], true) ?: [];
    $r['id'] = (int) $r['id'];
    $r['user_id'] = (int) $r['user_id'];
    $r['ver'] = (int) $r['ver'];
    $r['disc'] = $r['disc'] === null ? null : (float) $r['disc'];
    $r['project'] = $staff ? (string) $r['project'] : '';  // проект (папка объекта) — только сотрудникам
    $r['made_by'] = $r['made_by'] === null ? null : (int) $r['made_by'];
    $r['made_name'] = $staff && $r['made_by'] ? ($r['made_name'] ?: $r['made_tg']) : null;  // клиенту — только что смету подготовила AllVision
    unset($r['made_tg']);
    return $r;
};
// человек для поиска и карточки: имя (или из Telegram), телефон, ключ телефона — последние 9 цифр
$personOf = function (array $u): array {
    return ['id' => (int) $u['id'], 'name' => $u['name'] ?: $u['tg_name'], 'tg_username' => $u['tg_username'], 'phone' => $u['phone'], 'company' => $u['company'],
        'role' => $u['role'], 'discount' => (float) $u['discount'], 'status' => $u['status'], 'key' => kab_phone_key($u['phone'])];
};

try {
switch ($a) {
case 'me':
    reply(200, ['ok' => true, 'user' => pub($me), 'staff' => $staff, 'admin' => $admin]);

case 'bot':  // имя бота для кнопки «Войти через Telegram», номер бота — для входа в этой вкладке; oidc — включён новый вход (tg.php)
    $name = kab_bot_name();
    reply($name !== '' ? 200 : 503, ['ok' => $name !== '', 'bot' => $name, 'id' => kab_bot_id(), 'oidc' => kab_oidc_on()]);

case 'login':
    $need($post, 405);
    // не больше 30 попыток за 10 минут с одного адреса
    $rl = kab_dir() . '/rl_login_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
    $times = array_filter(array_map('intval', is_file($rl) ? file($rl) : []), function ($t) { return $t > time() - 600; });
    if (count($times) >= 30) reply(429, ['ok' => false, 'error' => 'rate']);
    $times[] = time();
    @file_put_contents($rl, implode("\n", $times));
    $tg = kab_tg_check(array_map('strval', array_filter($in, 'is_scalar')));
    if (!$tg) reply(401, ['ok' => false, 'error' => 'telegram']);
    $u = kab_tg_enter((int) $tg['id'], (string) ($tg['username'] ?? ''), ($tg['first_name'] ?? '') . ' ' . ($tg['last_name'] ?? ''));
    if (!$u) reply(403, ['ok' => false, 'error' => 'blocked']);
    reply(200, ['ok' => true, 'user' => pub($u), 'staff' => kab_is_staff($u), 'admin' => kab_is_admin($u)]);

case 'logout':
    $need($post, 405);
    kab_end_session();
    reply(200, ['ok' => true]);

case 'profile':  // анкета при первом входе и правка своих данных
    $need($post, 405);
    $need((bool) $me, 401);
    $name = kab_clean($in['name'] ?? '', 80);
    $phone = kab_clean($in['phone'] ?? '', 40);
    $company = kab_clean($in['company'] ?? '', 120);
    $unp = kab_clean($in['unp'] ?? '', 20);
    if (mb_strlen($name) < 2) reply(422, ['ok' => false, 'error' => 'name']);
    if (preg_match_all('/\d/', $phone) < 7) reply(422, ['ok' => false, 'error' => 'phone']);
    if ($me['status'] === 'form' && empty($in['consent'])) reply(422, ['ok' => false, 'error' => 'consent']);
    // роль в анкете не выбирают (владелец 03.11.2026): все — «пользователь», права отмечает сотрудник во вкладке «Пользователи»
    $role = in_array((int) $me['tg_id'], kab_staff_ids(), true) ? 'staff' : $me['role'];
    $first = $me['status'] === 'form';
    $db->prepare('UPDATE users SET name = ?, phone = ?, company = ?, unp = ?, role = ?, status = ?, consent_at = ? WHERE id = ?')
        ->execute([$name, $phone, $company, $unp, $role, 'active', $first ? kab_now() : $me['consent_at'], $me['id']]);
    if ($first && $role !== 'staff') {  // сотрудникам — о новом человеке, чтобы отметить ему права
        kab_say(kab_cfg()['tg_chat'] ?? '', implode("\n", array_filter([
            'Новый пользователь на hdl.by: ' . $name . ($me['tg_username'] ? ' (@' . $me['tg_username'] . ')' : ''),
            'Телефон: ' . $phone,
            $company ? 'Компания: ' . $company . ($unp ? ', УНП ' . $unp : '') : '',
            'Отметить права (клиент, дилер, сотрудник): ' . kab_site() . '/kabinet/#users',
        ])));
    }
    $q = $db->prepare('SELECT * FROM users WHERE id = ?');
    $q->execute([$me['id']]);
    $u = $q->fetch();
    reply(200, ['ok' => true, 'user' => pub($u), 'staff' => kab_is_staff($u), 'admin' => kab_is_admin($u)]);

case 'delete_me':  // удалить свои данные: пользователь, сметы, вход; заявки остаются без привязки к человеку
    $need($post, 405);
    $need((bool) $me, 401);
    $need(!$staff, 409);  // сотрудника удаляет другой сотрудник: иначе можно остаться без подтверждающих
    $q = $db->prepare("SELECT path FROM files WHERE kind = 'doc' AND user_id = ?");  // документы по объекту — с диска тоже
    $q->execute([$me['id']]);
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $path) @unlink(kab_dir() . '/' . $path);
    kab_end_session();
    $db->prepare('DELETE FROM users WHERE id = ?')->execute([$me['id']]);
    reply(200, ['ok' => true]);

case 'smetas':  // свои сметы (и подготовленные для меня сотрудником); сотрудник — все (all=1)
    $need((bool) $me, 401);
    $all = $staff && !empty($in['all']);
    $q = $db->prepare($smetaSql . ($all ? '' : ' WHERE s.user_id = ?') . ' ORDER BY s.updated_at DESC LIMIT 300');
    $q->execute($all ? [] : [$me['id']]);
    reply(200, ['ok' => true, 'smetas' => array_map($smetaRow, $q->fetchAll())]);

// одна смета или заявка — свежая, в момент «Открыть» (владелец 06.11.2026: после сохранения и «Назад» открывалась старая версия).
// Сотруднику — любая, остальным — только своя
case 'smeta_get':
    $need((bool) $me, 401);
    $q = $db->prepare($smetaSql . ' WHERE s.id = ?' . ($staff ? '' : ' AND s.user_id = ?'));
    $q->execute($staff ? [(int) ($in['id'] ?? 0)] : [(int) ($in['id'] ?? 0), $me['id']]);
    $r = $q->fetch();
    $need((bool) $r, 404);
    reply(200, ['ok' => true, 'smeta' => $smetaRow($r)]);

case 'lead_get':
    $need((bool) $me, 401);
    $q = $db->prepare($leadSql . ' WHERE l.id = ?' . ($staff ? '' : ' AND l.user_id = ?'));
    $q->execute($staff ? [(int) ($in['id'] ?? 0)] : [(int) ($in['id'] ?? 0), $me['id']]);
    $r = $q->fetch();
    $need((bool) $r, 404);
    reply(200, ['ok' => true, 'lead' => $leadRow($r)]);

case 'smeta_save':  // своя смета в кабинет
case 'smeta_for':   // сотрудник: смета клиенту или дилеру — у человека в кабинете, со скидкой в смете вместо личной, сообщение в Telegram (владелец 05.11.2026)
    $need($post, 405);
    $need((bool) $me, 401);
    $for = $a === 'smeta_for';
    $owner = $me;
    if ($for) {
        $need($staff);
        $q = $db->prepare('SELECT * FROM users WHERE id = ?');
        $q->execute([(int) ($in['user_id'] ?? 0)]);
        $owner = $q->fetch();
        $need($owner && $owner['status'] !== 'blocked', 404);
    }
    // ручная скидка по строкам и свои строки — только от сотрудника (владелец 05.11.2026); у клиента их нет, чтобы не подделать скидку.
    // Клиент сохраняет к себе смету или заявку от AllVision (sid / lid) — скидки и свои строки берём из базы, количество — из запроса (06.11.2026)
    $src = null;
    if (!$staff && !$for) {
        if ($sid = (int) ($in['sid'] ?? 0)) {
            $q = $db->prepare('SELECT items, ld, extra, disc FROM smetas WHERE id = ? AND user_id = ?');
            $q->execute([$sid, $me['id']]);
            // скидки — только у позиций, что есть в самой смете: у убранной позиции скидка могла остаться в базе с 05.11
            if ($r = $q->fetch()) $src = ['ld' => array_intersect_key(json_decode((string) $r['ld'], true) ?: [], json_decode((string) $r['items'], true) ?: []), 'extra' => json_decode((string) $r['extra'], true) ?: [], 'd' => $r['disc']];
        } elseif ($lid = (int) ($in['lid'] ?? 0)) {
            $q = $db->prepare('SELECT sm FROM leads WHERE id = ? AND user_id = ?');
            $q->execute([$lid, $me['id']]);
            if ($r = json_decode((string) $q->fetchColumn(), true)) $src = ['ld' => array_intersect_key((array) ($r['ld'] ?? []), (array) ($r['items'] ?? [])), 'extra' => (array) ($r['extra'] ?? []), 'd' => $r['d'] ?? null];
        }
    }
    ['items' => $items, 'ld' => $ld, 'extra' => $extra] = $src
        ? kab_sm_clean(['items' => $in['items'] ?? [], 'ld' => $src['ld'], 'extra' => $src['extra']], true) : kab_sm_clean($in, $staff);
    if (!$items && !$extra) reply(422, ['ok' => false, 'error' => 'empty']);
    $ldJson = json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT);
    $exJson = json_encode($extra, JSON_UNESCAPED_UNICODE);
    $title = kab_clean($in['title'] ?? '', 120) ?: 'Смета от ' . date('d.m.Y');
    $doc = kab_doc($in['doc'] ?? '');  // название документа — только из списка сотрудников
    // скидка в смете: пусто — личная скидка человека (NULL), иначе 0–50 (владелец 06.11.2026: пустое поле больше не означает «0 %»)
    $disc = $for ? kab_disc($in['disc'] ?? null) : ($src ? kab_disc($src['d']) : ($staff ? kab_disc($in['d'] ?? null) : null));
    $json = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT);
    $id = (int) ($in['id'] ?? 0);
    if ($id) {  // своя — только своя; клиенту — смета этого человека (сотрудник правит открытую из кабинета)
        $q = $for ? $db->prepare('UPDATE smetas SET title = ?, doc = ?, items = ?, ld = ?, extra = ?, disc = ?, made_by = ?, updated_at = ?, ver = ver + 1, ver_by = ?, ver_at = ? WHERE id = ? AND user_id = ?')
            : $db->prepare('UPDATE smetas SET title = ?, doc = ?, items = ?, ld = ?, extra = ?, updated_at = ?, ver = ver + 1, ver_by = ?, ver_at = ? WHERE id = ? AND user_id = ?');
        $q->execute($for ? [$title, $doc, $json, $ldJson, $exJson, $disc, $me['id'], kab_now(), $me['id'], kab_now(), $id, $owner['id']] : [$title, $doc, $json, $ldJson, $exJson, kab_now(), $me['id'], kab_now(), $id, $me['id']]);
        $need($q->rowCount() > 0, 404);
    } else {
        $n = $db->prepare('SELECT COUNT(*) FROM smetas WHERE user_id = ?');
        $n->execute([$owner['id']]);
        if ((int) $n->fetchColumn() >= 100) reply(422, ['ok' => false, 'error' => 'limit']);
        $db->prepare('INSERT INTO smetas (user_id, title, doc, items, ld, extra, disc, made_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$owner['id'], $title, $doc, $json, $ldJson, $exJson, $disc, $for ? $me['id'] : null, kab_now(), kab_now()]);
        $id = (int) $db->lastInsertId();
    }
    // «Сохранить в проект» (сотрудник, своя смета): проект — из списка папок объектов
    if ($staff && !$for && ($proj = kab_clean($in['project'] ?? '', 200)) !== '') {
        $q = $db->prepare('SELECT COUNT(*) FROM projects WHERE name = ?');
        $q->execute([$proj]);
        $need((int) $q->fetchColumn() > 0, 404);
        $db->prepare('UPDATE smetas SET project = ?, proj_at = NULL WHERE id = ?')->execute([$proj, $id]);
    }
    $q = $db->prepare('SELECT ver FROM smetas WHERE id = ?');
    $q->execute([$id]);
    $ver = (int) $q->fetchColumn();
    $sent = false;
    if ($for && !empty($in['notify'])) {  // написать боту можно, только если человек разрешил при входе
        $what = $doc !== '' ? mb_strtolower(mb_substr($doc, 0, 1)) . mb_substr($doc, 1) : 'смету';
        $sent = kab_say($owner['tg_id'], 'AllVision подготовил для вас ' . $what . ' «' . $title . '» на hdl.by: ' . (count($items) + count($extra)) . ' поз.'
            . ($disc > 0 ? ', скидка ' . kab_pct((float) $disc) : '') . '. Открыть: ' . kab_site() . '/kabinet/#smetas');
    }
    reply(200, ['ok' => true, 'id' => $id, 'title' => $title, 'sent' => $sent, 'ver' => $ver, 'disc' => $disc]);

case 'smeta_upd':  // сотрудник: «Сохранить» в открытой смете — любая смета, на месте; чья и кто подготовил — как были (владелец 06.11.2026)
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT s.id, s.title, s.user_id, s.items, s.ld, s.extra, s.doc, s.disc, s.ver, COALESCE(s.ver_at, s.edited_at) AS edited_at, u.tg_id,
        e.name AS edited_name, e.tg_name AS edited_tg FROM smetas s JOIN users u ON u.id = s.user_id LEFT JOIN users e ON e.id = COALESCE(s.ver_by, s.edited_by) WHERE s.id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $sm = $q->fetch();
    $need((bool) $sm, 404);
    ['items' => $items, 'ld' => $ld, 'extra' => $extra] = kab_sm_clean($in, true);
    if (!$items && !$extra) reply(422, ['ok' => false, 'error' => 'empty']);
    // скидка сметы: страница шлёт disc (вкладка со старым скриптом — d); нет ни того ни другого — прежняя.
    // До 06.11.2026 страница слала d, а здесь читалось disc — каждое сохранение стирало скидку
    $old = $sm['disc'] === null ? null : (float) $sm['disc'];
    $disc = array_key_exists('disc', $in) ? kab_disc($in['disc']) : (array_key_exists('d', $in) ? kab_disc($in['d']) : $old);
    $title = kab_clean($in['title'] ?? '', 120) ?: (string) $sm['title'];
    $doc = kab_doc($in['doc'] ?? '');
    // передать смету другому человеку (to — его номер): вместе с составом, под той же проверкой версии (владелец 06.11.2026)
    $to = null;
    if ($toId = (int) ($in['to'] ?? 0)) {
        $q = $db->prepare("SELECT id, tg_id, name, tg_name, discount FROM users WHERE id = ? AND status <> 'blocked'");
        $q->execute([$toId]);
        $to = $q->fetch();
        $need((bool) $to, 404);
        if ((int) $to['id'] === (int) $sm['user_id']) $to = null;
        else {
            $n = $db->prepare('SELECT COUNT(*) FROM smetas WHERE user_id = ?');
            $n->execute([$to['id']]);
            if ((int) $n->fetchColumn() >= 100) reply(422, ['ok' => false, 'error' => 'limit']);
        }
    }
    // ничего не поменялось — ничего не пишем: ни «изменил», ни новой версии, ни сообщения клиенту. Сравнение через json_encode:
    // нестрогое == считало пустую скидку (личная) и 0 % одним и тем же, и такая правка не сохранялась (06.11.2026)
    if (!$to && json_encode([json_decode((string) $sm['items'], true) ?: [], json_decode((string) $sm['ld'], true) ?: [], json_decode((string) $sm['extra'], true) ?: [], (string) $sm['doc'], $old, (string) $sm['title']])
        === json_encode([$items, $ld, $extra, $doc, $disc, $title]))
        reply(200, ['ok' => true, 'same' => true, 'sent' => false, 'ver' => (int) $sm['ver'], 'title' => $title, 'disc' => $disc]);
    // версия: открыли версию v, а в базе уже другая — смету тем временем сохранил кто-то ещё (или эта же смета в другой вкладке)
    $v = isset($in['v']) && is_numeric($in['v']) && empty($in['force']) ? (int) $in['v'] : null;
    $q = $db->prepare('UPDATE smetas SET title = ?, items = ?, ld = ?, extra = ?, doc = ?, disc = ?, edited_by = ?, edited_at = ?, updated_at = ?, ver = ver + 1, ver_by = ?, ver_at = ?'
        . ($to ? ', user_id = ?, made_by = ?' : '') . ' WHERE id = ?' . ($v !== null ? ' AND ver = ?' : ''));
    $q->execute(array_merge([$title, json_encode($items, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT), json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT),
        json_encode($extra, JSON_UNESCAPED_UNICODE), $doc, $disc, $me['id'], kab_now(), kab_now(), $me['id'], kab_now()], $to ? [$to['id'], $me['id']] : [], [$sm['id']], $v !== null ? [$v] : []));
    if ($q->rowCount() === 0) reply(409, ['ok' => false, 'error' => 'stale', 'by' => $sm['edited_name'] ?: $sm['edited_tg'], 'at' => $sm['edited_at']]);
    $sent = false;
    if ($to) {
        if (!empty($in['notify']) && (int) $to['id'] !== (int) $me['id'])
            $sent = kab_say($to['tg_id'], 'AllVision подготовил для вас смету «' . $title . '» на hdl.by: ' . (count($items) + count($extra)) . ' поз.'
                . ($disc > 0 ? ', скидка ' . kab_pct((float) $disc) : '') . '. Открыть: ' . kab_site() . '/kabinet/#smetas');
        reply(200, ['ok' => true, 'sent' => $sent, 'ver' => (int) $sm['ver'] + 1, 'title' => $title, 'disc' => $disc,
            'to' => (int) $to['id'], 'who' => $to['name'] ?: $to['tg_name'], 'ud' => (float) $to['discount']]);
    }
    if (!empty($in['notify']) && (int) $sm['user_id'] !== (int) $me['id'])
        $sent = kab_say($sm['tg_id'], 'AllVision изменил вашу смету «' . $title . '» на hdl.by: ' . (count($items) + count($extra)) . ' поз.'
            . ($disc > 0 ? ', скидка ' . kab_pct((float) $disc) : '') . '. Открыть: ' . kab_site() . '/kabinet/#smetas');
    reply(200, ['ok' => true, 'sent' => $sent, 'ver' => (int) $sm['ver'] + 1, 'title' => $title, 'disc' => $disc]);

case 'projects':  // сотрудник: список проектов (папки объектов) и сметы в них
    $need($staff);
    $names = $db->query('SELECT name FROM projects ORDER BY pos, name')->fetchAll(PDO::FETCH_COLUMN);
    $q = $db->query($smetaSql . " WHERE s.project <> '' ORDER BY s.updated_at DESC");
    reply(200, ['ok' => true, 'projects' => $names, 'smetas' => array_map($smetaRow, $q->fetchAll()), 'synced' => kab_kv_get('proj_sync')]);

case 'proj_set':  // компьютер AllVision: список папок D:\Work\Объекты
    $need(kab_build_ok());
    $need($post, 405);
    $names = array_values(array_unique(array_filter(array_map(function ($n) { return kab_clean((string) $n, 200); }, (array) ($in['names'] ?? [])))));
    $db->beginTransaction();
    $db->exec('DELETE FROM projects');
    $ins = $db->prepare('INSERT INTO projects (name, pos) VALUES (?, ?)');
    foreach ($names as $i => $n) $ins->execute([$n, $i]);
    $db->commit();
    $db->prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)')->execute(['proj_sync', json_encode(['at' => kab_now(), 'n' => count($names)])]);
    reply(200, ['ok' => true, 'n' => count($names)]);

case 'proj_export':  // компьютер AllVision: сметы проектов, которые ещё не лежат в папке объекта в последней версии
    $need(kab_build_ok());
    $q = $db->query("SELECT s.id, s.title, s.doc, s.project, s.items, s.ld, s.extra, s.disc, s.updated_at, u.name, u.tg_name FROM smetas s JOIN users u ON u.id = s.user_id
        WHERE s.project <> '' AND (s.proj_at IS NULL OR s.proj_at < s.updated_at) ORDER BY s.id");
    reply(200, ['ok' => true, 'smetas' => array_map(function ($r) {
        return ['id' => (int) $r['id'], 'title' => $r['title'], 'doc' => (string) $r['doc'], 'project' => $r['project'], 'items' => json_decode((string) $r['items'], true) ?: [],
            'ld' => json_decode((string) $r['ld'], true) ?: [], 'extra' => json_decode((string) $r['extra'], true) ?: [], 'disc' => $r['disc'] === null ? null : (float) $r['disc'],
            'updated_at' => $r['updated_at'], 'who' => $r['name'] ?: $r['tg_name']];
    }, $q->fetchAll())]);

case 'trip_export':  // компьютер AllVision: расчёты командировок с проектом, новая редакция которых ещё не лежит в папке объекта
    $need(kab_build_ok());
    $q = $db->query("SELECT t.num, t.version, t.project, t.place, t.total, t.vat, t.saved_at, t.xdoc, u.name, u.tg_name FROM trips t LEFT JOIN users u ON u.id = t.saved_by
        WHERE t.project <> '' AND t.xdoc <> '' AND (t.proj_at IS NULL OR t.proj_at < t.saved_at) ORDER BY t.id");
    reply(200, ['ok' => true, 'trips' => array_map(function ($r) {
        return ['num' => $r['num'], 'version' => (int) $r['version'], 'project' => $r['project'], 'place' => (string) $r['place'], 'total' => (float) $r['total'],
            'vat' => (bool) $r['vat'], 'saved_at' => $r['saved_at'], 'who' => $r['name'] ?: $r['tg_name'], 'doc' => json_decode((string) $r['xdoc'], true) ?: []];
    }, $q->fetchAll())]);

case 'trip_done':  // компьютер AllVision: эти редакции лежат в папках объектов
    $need(kab_build_ok());
    $need($post, 405);
    $u = $db->prepare('UPDATE trips SET proj_at = ? WHERE num = ?');
    foreach ((array) ($in['done'] ?? []) as $d) $u->execute([(string) ($d['at'] ?? ''), (string) ($d['num'] ?? '')]);
    reply(200, ['ok' => true]);

case 'proj_done':  // компьютер AllVision: эти версии смет лежат в папках объектов
    $need(kab_build_ok());
    $need($post, 405);
    $u = $db->prepare('UPDATE smetas SET proj_at = ? WHERE id = ?');
    foreach ((array) ($in['done'] ?? []) as $d) $u->execute([(string) ($d['at'] ?? ''), (int) ($d['id'] ?? 0)]);
    reply(200, ['ok' => true]);

// ---- командировочные бригады (владелец 07.11.2026): калькулятор с claude.ai перенесён на сайт, /kabinet/komandirovki/ ----
case 'trips':  // сотрудник: все расчёты, без содержимого
    $need($staff);
    $q = $db->query('SELECT t.num, t.version, t.user_id, t.project, t.place, t.dist, t.total, t.vat, t.pub, t.pub_at, t.saved_at, u.name, u.tg_name, s.name AS saved_name, s.tg_name AS saved_tg
        FROM trips t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN users s ON s.id = t.saved_by ORDER BY t.year DESC, t.seq DESC');
    reply(200, ['ok' => true, 'trips' => array_map(function ($r) {
        return ['num' => $r['num'], 'version' => (int) $r['version'], 'user_id' => $r['user_id'] === null ? null : (int) $r['user_id'], 'who' => $r['name'] ?: $r['tg_name'],
            'project' => (string) $r['project'], 'place' => (string) $r['place'], 'dist' => (float) $r['dist'], 'total' => (float) $r['total'], 'vat' => (bool) $r['vat'],
            'pub' => (bool) $r['pub'], 'pub_at' => $r['pub_at'], 'saved_at' => $r['saved_at'], 'saved_by' => $r['saved_name'] ?: $r['saved_tg']];
    }, $q->fetchAll())]);

case 'trip_get':  // сотрудник — любой расчёт; клиент — только выложенный ему
    $need((bool) $me, 401);
    $q = $db->prepare('SELECT t.*, u.name, u.tg_name FROM trips t LEFT JOIN users u ON u.id = t.user_id WHERE t.num = ?' . ($staff ? '' : ' AND t.user_id = ? AND t.pub = 1'));
    $q->execute($staff ? [(string) ($in['num'] ?? '')] : [(string) ($in['num'] ?? ''), $me['id']]);
    $r = $q->fetch();
    $need((bool) $r, 404);
    // клиенту — только форма КП (doc), без ставок и настроек расчёта
    $t = ['num' => $r['num'], 'version' => (int) $r['version'], 'total' => (float) $r['total'], 'vat' => (bool) $r['vat'], 'place' => (string) $r['place'],
        'saved_at' => $r['saved_at'], 'doc' => json_decode((string) $r['doc'], true) ?: null];
    if ($staff) $t += ['user_id' => $r['user_id'] === null ? null : (int) $r['user_id'], 'who' => $r['name'] ?: $r['tg_name'], 'project' => (string) $r['project'],
        'pub' => (bool) $r['pub'], 'pub_at' => $r['pub_at'], 'state' => json_decode((string) $r['state'], true) ?: []];
    reply(200, ['ok' => true, 'trip' => $t]);

case 'trips_my':  // клиент: расчёты командировочных, выложенные ему
    $need((bool) $me, 401);
    $q = $db->prepare('SELECT num, version, place, total, vat, saved_at FROM trips WHERE user_id = ? AND pub = 1 ORDER BY year DESC, seq DESC');
    $q->execute([$me['id']]);
    reply(200, ['ok' => true, 'trips' => array_map(function ($r) {
        return ['num' => $r['num'], 'version' => (int) $r['version'], 'place' => (string) $r['place'], 'total' => (float) $r['total'], 'vat' => (bool) $r['vat'], 'saved_at' => $r['saved_at']];
    }, $q->fetchAll())]);

case 'trip_pub':  // сотрудник: выложить клиенту (on) или убрать; doc — форма КП со страницы; notify — сообщить в Telegram
    $need($staff);
    $need($post, 405);
    $q = $db->prepare('SELECT t.num, t.user_id, t.total, t.vat, t.place, u.tg_id FROM trips t LEFT JOIN users u ON u.id = t.user_id WHERE t.num = ?');
    $q->execute([(string) ($in['num'] ?? '')]);
    $r = $q->fetch();
    $need((bool) $r, 404);
    $on = !empty($in['on']);
    if ($on && !$r['user_id']) reply(422, ['ok' => false, 'error' => 'client']);
    $doc = $in['doc'] ?? null;
    if ($on) $need(is_array($doc), 422);
    $now = kab_now();
    $db->prepare('UPDATE trips SET pub = ?, pub_at = ?' . ($on ? ', doc = ?' : '') . ' WHERE num = ?')
        ->execute($on ? [1, $now, json_encode($doc, JSON_UNESCAPED_UNICODE), $r['num']] : [0, null, $r['num']]);
    $sent = false;
    if ($on && !empty($in['notify']))
        $sent = kab_say($r['tg_id'], 'AllVision подготовил для вас расчёт командировочных и транспортных расходов ' . $r['num'] . ($r['place'] !== '' ? ' (' . $r['place'] . ')' : '')
            . ' на hdl.by: ' . number_format((float) $r['total'], 2, ',', ' ') . ' BYN' . ($r['vat'] ? ' с НДС' : '') . '. Открыть: ' . kab_site() . '/kabinet/#smetas');
    reply(200, ['ok' => true, 'pub' => $on, 'pub_at' => $on ? $now : null, 'sent' => $sent]);

case 'trip_save':  // сотрудник: сохранить (num — новая редакция того же номера) или «как новый» (без num) — следующий номер года
    $need($staff);
    $need($post, 405);
    $st = $in['state'] ?? null;
    $need(is_array($st), 422);
    $json = json_encode($st, JSON_UNESCAPED_UNICODE);
    $need(strlen($json) < 200000, 413);
    $uid = (int) ($in['user_id'] ?? 0) ?: null;
    if ($uid) { $q = $db->prepare('SELECT COUNT(*) FROM users WHERE id = ?'); $q->execute([$uid]); $need((int) $q->fetchColumn() > 0, 404); }
    $proj = kab_clean($in['project'] ?? '', 200);
    $place = kab_clean($in['place'] ?? '', 200);
    $xdoc = is_array($in['xdoc'] ?? null) ? json_encode($in['xdoc'], JSON_UNESCAPED_UNICODE) : '';
    $vals = [$uid, $proj, $place, (float) ($in['dist'] ?? 0), round((float) ($in['total'] ?? 0), 2), empty($in['vat']) ? 0 : 1, $json, $me['id'], kab_now(), $xdoc];
    $num = (string) ($in['num'] ?? '');
    if ($num !== '') {
        // выложенный клиенту: форма КП у клиента обновляется вместе с расчётом (doc со страницы); сменили клиента — у прежнего убираем
        $docJ = is_array($in['doc'] ?? null) ? json_encode($in['doc'], JSON_UNESCAPED_UNICODE) : null;
        $q = $db->prepare('UPDATE trips SET pub = CASE WHEN COALESCE(user_id, 0) = CAST(? AS INTEGER) THEN pub ELSE 0 END, doc = CASE WHEN pub = 1 AND COALESCE(user_id, 0) = CAST(? AS INTEGER) AND ? IS NOT NULL THEN ? ELSE doc END,
            user_id = ?, project = ?, place = ?, dist = ?, total = ?, vat = ?, state = ?, saved_by = ?, saved_at = ?, xdoc = ?, version = version + 1 WHERE num = ?');
        $q->execute(array_merge([(int) $uid, (int) $uid, $docJ, $docJ], $vals, [$num]));
        $need($q->rowCount() > 0, 404);
    } else {
        $y = (int) date('Y');
        $db->beginTransaction();
        $q = $db->prepare('SELECT COALESCE(MAX(seq), 0) + 1 FROM trips WHERE year = ?');
        $q->execute([$y]);
        $seq = (int) $q->fetchColumn();
        $num = sprintf('КР-%d-%03d', $y, $seq);
        $db->prepare('INSERT INTO trips (user_id, project, place, dist, total, vat, state, saved_by, saved_at, xdoc, num, year, seq, version, made_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
            ->execute(array_merge($vals, [$num, $y, $seq, $me['id'], kab_now()]));
        $db->commit();
    }
    $q = $db->prepare('SELECT version, saved_at, pub, pub_at FROM trips WHERE num = ?');
    $q->execute([$num]);
    $r = $q->fetch();
    reply(200, ['ok' => true, 'num' => $num, 'version' => (int) $r['version'], 'saved_at' => $r['saved_at'], 'pub' => (bool) $r['pub'], 'pub_at' => $r['pub_at']]);

case 'smeta_del':
    $need($post, 405);
    $need((bool) $me, 401);
    // свою — человек, подготовленную клиенту — и сотрудник, кто её сделал
    $q = $db->prepare('DELETE FROM smetas WHERE id = ? AND ' . ($staff ? '(user_id = ? OR made_by = ?)' : 'user_id = ?'));
    $q->execute($staff ? [(int) ($in['id'] ?? 0), $me['id'], $me['id']] : [(int) ($in['id'] ?? 0), $me['id']]);
    reply(200, ['ok' => $q->rowCount() > 0]);

case 'doc_titles':  // названия документа для печати сметы («Коммерческое предложение», «Заказ покупателя»…): читает любой — клиент сверяет название
case 'doc_title_add':  // из ссылки со списком; добавить и убрать может любой сотрудник
case 'doc_title_del':
    if ($a !== 'doc_titles') {
        $need($staff);
        $need($post, 405);
        if ($a === 'doc_title_add') {
            $t = kab_clean($in['title'] ?? '', 80);
            $need($t !== '' && mb_strtolower($t) !== 'список для сметы', 422);
            $db->prepare('INSERT OR IGNORE INTO doc_titles (title, created_by, created_at) VALUES (?, ?, ?)')->execute([$t, $me['id'], kab_now()]);
        } else {
            $db->prepare('DELETE FROM doc_titles WHERE id = ?')->execute([(int) ($in['id'] ?? 0)]);
        }
    }
    $rows = array_map(function ($r) { return ['id' => (int) $r['id'], 'title' => $r['title']]; }, $db->query('SELECT id, title FROM doc_titles ORDER BY id')->fetchAll());
    reply(200, ['ok' => true, 'titles' => $rows]);

// ---- ассортимент из кабинета (этап 3, владелец 05.11.2026): сотрудник правит позицию или добавляет новую; на сайт правки попадают сборкой
// на компьютере AllVision (cabinet_sync.py): ночью или по «Обновить сайт сейчас» ----
case 'cat_list':
    $need($staff);
    $rows = $db->query('SELECT e.*, u.name AS by_name, u.tg_name AS by_tg FROM cat_edits e LEFT JOIN users u ON u.id = e.updated_by ORDER BY e.updated_at DESC')->fetchAll();
    $rows = array_map(function ($r) {
        return ['art' => $r['art'], 'is_new' => (bool) $r['is_new'], 'name' => $r['name'], 'price' => $r['price'] === null ? null : (float) $r['price'],
            'about' => $r['about'], 'hidden' => (bool) $r['hidden'], 'gnum' => $r['gnum'], 'platform' => $r['platform'], 'photo' => $r['photo'] !== '',
            'deleted' => (bool) $r['deleted'], 'by' => $r['by_name'] ?: $r['by_tg'], 'at' => $r['updated_at'],
            'pending' => $r['synced_at'] === null || $r['synced_at'] <= $r['updated_at']];  // та же секунда — считаем ждущей: лишняя сборка безвредна
    }, $rows);
    reply(200, ['ok' => true, 'edits' => $rows, 'request' => kab_kv_get('rebuild'), 'last' => kab_kv_get('last_sync'), 'ready' => (string) (kab_cfg()['build_key'] ?? '') !== '']);

case 'cat_set':  // правка позиции или новая позиция; фото — файлом в том же запросе (форма)
    $need($post, 405);
    $need($staff);
    $art = kab_clean($in['art'] ?? '', 80);
    $need($art !== '', 422);
    $q = $db->prepare('SELECT * FROM cat_edits WHERE art = ?');
    $q->execute([$art]);
    $old = $q->fetch() ?: null;
    $isNew = !empty($in['is_new']);
    $name = kab_clean($in['name'] ?? '', 200);
    $about = trim(mb_substr(str_replace("\r", '', (string) ($in['about'] ?? '')), 0, 4000));
    $price = trim(str_replace(',', '.', (string) ($in['price'] ?? '')));
    $price = $price === '' ? null : round(max(0.0, min(100000.0, (float) $price)), 2);
    $gnum = in_array($in['gnum'] ?? '', KAB_CAT_GROUPS, true) ? $in['gnum'] : '';
    $platform = in_array($in['platform'] ?? '', KAB_CAT_PLATFORMS, true) ? $in['platform'] : '';
    if ($isNew && ($name === '' || $gnum === '')) reply(422, ['ok' => false, 'error' => 'new']);  // новой позиции нужны название и раздел
    $photo = $old ? (string) $old['photo'] : '';
    $dir = kab_dir() . '/catalog';
    if (!empty($in['drop_photo']) && $photo !== '') { @unlink($dir . '/' . $photo); $photo = ''; }
    $f = $_FILES['photo'] ?? null;
    if ($f && ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
        if ($f['error'] !== UPLOAD_ERR_OK || !in_array($ext, KAB_CAT_PHOTO, true) || !@getimagesize($f['tmp_name'])) reply(422, ['ok' => false, 'error' => 'photo']);
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        $newName = bin2hex(random_bytes(8)) . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
        if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $newName)) reply(500, ['ok' => false, 'error' => 'photo']);
        if ($photo !== '') @unlink($dir . '/' . $photo);
        $photo = $newName;
    }
    $hidden = !empty($in['hidden']) ? 1 : 0;
    if (!$isNew && $name === '' && $price === null && $about === '' && !$hidden && $photo === '') reply(422, ['ok' => false, 'error' => 'nothing']);
    // была правка — обновить (synced_at остаётся: по нему видно, что после сборки правку меняли), нет — добавить. Без ON CONFLICT: SQLite хостинга может быть старше 3.24
    $vals = [$isNew ? 1 : 0, $name, $price, $about, $hidden, $isNew ? $gnum : '', $isNew ? ($platform ?: 'buspro') : '', $photo, $me['id'], kab_now(), $art];
    if ($old) $db->prepare('UPDATE cat_edits SET is_new = ?, name = ?, price = ?, about = ?, hidden = ?, gnum = ?, platform = ?, photo = ?, deleted = 0, updated_by = ?, updated_at = ? WHERE art = ?')->execute($vals);
    else $db->prepare('INSERT INTO cat_edits (is_new, name, price, about, hidden, gnum, platform, photo, deleted, updated_by, updated_at, art) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')->execute($vals);
    reply(200, ['ok' => true]);

case 'cat_del':  // отменить правку: со следующей сборкой позиция станет как в прайсе, новая — исчезнет. Ещё не была в сборке — удаляется сразу
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT * FROM cat_edits WHERE art = ?');
    $q->execute([kab_clean($in['art'] ?? '', 80)]);
    $e = $q->fetch();
    $need((bool) $e, 404);
    if ($e['synced_at'] === null) {
        if ($e['photo'] !== '') @unlink(kab_dir() . '/catalog/' . $e['photo']);
        $db->prepare('DELETE FROM cat_edits WHERE art = ?')->execute([$e['art']]);
    } else {
        $db->prepare('UPDATE cat_edits SET deleted = 1, updated_by = ?, updated_at = ? WHERE art = ?')->execute([$me['id'], kab_now(), $e['art']]);
    }
    reply(200, ['ok' => true]);

case 'rebuild':  // «Обновить сайт сейчас»: компьютер AllVision проверяет запрос раз в 10 минут
    $need($post, 405);
    $need($staff);
    kab_kv_set('rebuild', ['at' => kab_now(), 'by' => $me['name'] ?: $me['tg_name']]);
    reply(200, ['ok' => true, 'request' => kab_kv_get('rebuild')]);

case 'cat_export':  // компьютеру сборки: все действующие правки, запрос «сейчас», отметка времени выгрузки
    $need(kab_build_ok());
    $rows = $db->query('SELECT art, is_new, name, price, about, hidden, gnum, platform, photo, updated_at, synced_at FROM cat_edits WHERE deleted = 0 ORDER BY art')->fetchAll();
    $pending = (int) $db->query('SELECT COUNT(*) FROM cat_edits WHERE synced_at IS NULL OR synced_at <= updated_at')->fetchColumn();
    reply(200, ['ok' => true, 'exported_at' => kab_now(), 'pending' => $pending, 'request' => kab_kv_get('rebuild'),
        'edits' => array_map(function ($r) {
            return ['art' => $r['art'], 'is_new' => (bool) $r['is_new'], 'name' => $r['name'], 'price' => $r['price'] === null ? null : (float) $r['price'], 'about' => $r['about'],
                'hidden' => (bool) $r['hidden'], 'gnum' => $r['gnum'], 'platform' => $r['platform'], 'photo' => $r['photo']];
        }, $rows)]);

case 'cat_photo':  // компьютеру сборки: фото правки
    $need(kab_build_ok());
    $name = basename((string) ($in['photo'] ?? ''));
    $full = kab_dir() . '/catalog/' . $name;
    $need(preg_match('/^[0-9a-f]{16}\.(jpg|png|webp)$/', $name) === 1 && is_file($full), 404);
    if (ob_get_level()) ob_end_clean();
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($full));
    header('Cache-Control: private, no-store');
    readfile($full);
    exit;

case 'cat_done':  // компьютер сборки: итог. Удачно — правки до exported_at отмечаются как на сайте, отменённые удаляются; запрос «сейчас» снимается всегда
    $need($post, 405);
    $need(kab_build_ok());
    $at = (string) ($in['exported_at'] ?? '');
    $need((bool) preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $at), 422);
    $ok = !empty($in['ok']);
    if ($ok) {
        $db->prepare('UPDATE cat_edits SET synced_at = ? WHERE deleted = 0 AND updated_at < ?')->execute([kab_now(), $at]);
        $gone = $db->prepare('SELECT photo FROM cat_edits WHERE deleted = 1 AND updated_at < ?');
        $gone->execute([$at]);
        foreach ($gone->fetchAll() as $g) if ($g['photo'] !== '') @unlink(kab_dir() . '/catalog/' . $g['photo']);
        $db->prepare('DELETE FROM cat_edits WHERE deleted = 1 AND updated_at < ?')->execute([$at]);
    }
    $req = kab_kv_get('rebuild');  // на запрос ответили — удачно или нет: причину сотрудник видит в «Последняя сборка» и может нажать снова
    if ($req && ($req['at'] ?? '') <= $at) kab_kv_set('rebuild', null);
    kab_kv_set('last_sync', ['at' => kab_now(), 'ok' => $ok, 'note' => kab_clean($in['note'] ?? '', 300)]);
    reply(200, ['ok' => true]);

case 'leads':  // свои заявки; сотрудник — все заявки с сайта
    $need((bool) $me, 401);
    $q = $db->prepare($leadSql . ($staff ? '' : ' WHERE l.user_id = ?') . ' ORDER BY l.id DESC LIMIT 300');
    $q->execute($staff ? [] : [$me['id']]);
    reply(200, ['ok' => true, 'leads' => array_map($leadRow, $q->fetchAll())]);

case 'lead_save':  // сотрудник: «Сохранить изменения» в открытой заявке (владелец 06.11.2026). Строки и сумма — как их посчитала страница сметы
    // по сегодняшним ценам; первая правка сохраняет, как прислал клиент (items0, total0); клиент видит новую версию, по галочке — сообщение в Telegram
    // sm.d — общая скидка (null — личная клиента), sm.ud — личная скидка клиента на момент сохранения: при новом открытии заявка считается
    // так же, даже если клиенту потом поменяли скидку (владелец 06.11.2026)
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT l.id, l.user_id, l.items, l.total, l.sm, l.ver, l.note, l.name, l.phone, COALESCE(l.ver_at, l.edited_at) AS edited_at, u.tg_id,
        e.name AS edited_name, e.tg_name AS edited_tg FROM leads l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users e ON e.id = COALESCE(l.ver_by, l.edited_by) WHERE l.id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $ld0 = $q->fetch();
    $need((bool) $ld0, 404);
    $st = kab_sm_clean($in, true);
    if (!$st['items'] && !$st['extra']) reply(422, ['ok' => false, 'error' => 'empty']);
    [$rows, $sum] = kab_lead_rows($in['rows'] ?? null);
    $sm = kab_sm_json($st, ['d' => kab_disc($in['d'] ?? null), 'ud' => kab_disc($in['ud'] ?? null), 'doc' => kab_doc($in['doc'] ?? '')]);
    // заметка (любой заявке) и имя с телефоном (заявке без кабинета) — в том же сохранении и под той же проверкой версии:
    // отдельным запросом заметка коллеги затиралась мимо проверки (06.11.2026)
    $meta = kab_lead_meta($in, $ld0);
    if (isset($meta['error'])) reply(422, ['ok' => false, 'error' => $meta['error']]);
    // ничего не поменялось — ничего не пишем: заявка не пересчитывается, клиенту повторно не пишем. Сравнение точное: пустая скидка и 0 % — разное
    if (!$meta && json_encode(json_decode((string) $ld0['sm'], true)) === json_encode(json_decode($sm, true))
        && json_encode(json_decode((string) $ld0['items'], true) ?: []) === json_encode($rows) && abs((float) $ld0['total'] - $sum) < 0.005)
        reply(200, ['ok' => true, 'same' => true, 'sent' => false, 'total' => $sum, 'ver' => (int) $ld0['ver']]);
    $v = isset($in['v']) && is_numeric($in['v']) && empty($in['force']) ? (int) $in['v'] : null;
    $set = '';
    foreach (array_keys($meta) as $c) $set .= ", $c = ?";
    // SQLite берёт справа старые значения строки: items0 и total0 — прежний состав, если правка первая
    $q = $db->prepare('UPDATE leads SET items0 = COALESCE(items0, items), total0 = CASE WHEN items0 IS NULL THEN total ELSE total0 END,
        items = ?, total = ?, sm = ?, edited_by = ?, edited_at = ?, ver = ver + 1, ver_by = ?, ver_at = ?' . $set . ' WHERE id = ?' . ($v !== null ? ' AND ver = ?' : ''));
    $q->execute(array_merge([json_encode($rows, JSON_UNESCAPED_UNICODE), $sum, $sm, $me['id'], kab_now(), $me['id'], kab_now()], array_values($meta), [$ld0['id']], $v !== null ? [$v] : []));
    if ($q->rowCount() === 0) reply(409, ['ok' => false, 'error' => 'stale', 'by' => $ld0['edited_name'] ?: $ld0['edited_tg'], 'at' => $ld0['edited_at']]);
    $sent = false;
    if (!empty($in['notify']) && $ld0['tg_id'])
        $sent = kab_say($ld0['tg_id'], 'AllVision изменил вашу заявку №' . $ld0['id'] . ' на hdl.by: ' . kab_lead_money($rows, $sum) . '. Посмотреть: ' . kab_site() . '/kabinet/#leads');
    reply(200, ['ok' => true, 'sent' => $sent, 'total' => $sum, 'ver' => (int) $ld0['ver'] + 1]);

case 'lead_meta':  // сотрудник: заметка для своих (клиент её не видит); у заявки без кабинета — ещё имя и телефон (владелец 06.11.2026).
    // Только они изменились — состав и цены не трогаем, «изменил» не ставим (клиенту в заявке ничего не поменялось), но версию — да:
    // коллега с этой же заявкой при сохранении увидит «уже изменил», а не затрёт заметку
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT l.id, l.user_id, l.note, l.name, l.phone, l.ver, COALESCE(l.ver_at, l.edited_at) AS edited_at, e.name AS edited_name, e.tg_name AS edited_tg
        FROM leads l LEFT JOIN users e ON e.id = COALESCE(l.ver_by, l.edited_by) WHERE l.id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $l = $q->fetch();
    $need((bool) $l, 404);
    $meta = kab_lead_meta($in, $l);
    if (isset($meta['error'])) reply(422, ['ok' => false, 'error' => $meta['error']]);
    $v = isset($in['v']) && is_numeric($in['v']) && empty($in['force']) ? (int) $in['v'] : null;
    // версия — до «без изменений»: здесь сравниваются только заметка и контакты, а состав мог поменять коллега
    if ($v !== null && $v !== (int) $l['ver']) reply(409, ['ok' => false, 'error' => 'stale', 'by' => $l['edited_name'] ?: $l['edited_tg'], 'at' => $l['edited_at']]);
    if (!$meta) reply(200, ['ok' => true, 'same' => true, 'ver' => (int) $l['ver']]);
    $set = [];
    foreach (array_keys($meta) as $c) $set[] = "$c = ?";
    $q = $db->prepare('UPDATE leads SET ' . implode(', ', $set) . ', ver = ver + 1, ver_by = ?, ver_at = ? WHERE id = ?' . ($v !== null ? ' AND ver = ?' : ''));
    $q->execute(array_merge(array_values($meta), [$me['id'], kab_now(), $l['id']], $v !== null ? [$v] : []));
    if ($q->rowCount() === 0) reply(409, ['ok' => false, 'error' => 'stale', 'by' => $l['edited_name'] ?: $l['edited_tg'], 'at' => $l['edited_at']]);
    reply(200, ['ok' => true, 'ver' => (int) $l['ver'] + 1]);

case 'people':  // сотрудник: все для поиска — пользователи кабинета и те, кто оставлял заявки без входа (вместе по телефону); фильтрует страница
    $need((bool) $me, 401);
    $need($staff);
    $users = [];
    $byKey = [];
    foreach ($db->query('SELECT u.*, (SELECT COUNT(*) FROM leads l WHERE l.user_id = u.id) AS nl, (SELECT COUNT(*) FROM smetas s WHERE s.user_id = u.id) AS ns FROM users u') as $u) {
        $users[] = $personOf($u) + ['nl' => (int) $u['nl'], 'ns' => (int) $u['ns']];
        if ($users[count($users) - 1]['key'] !== '') $byKey[$users[count($users) - 1]['key']] = count($users) - 1;
    }
    $anon = [];
    foreach ($db->query('SELECT name, phone FROM leads WHERE user_id IS NULL ORDER BY id DESC') as $l) {  // свежая заявка — первой: имя из неё
        $k = kab_phone_key($l['phone']);
        if ($k === '') continue;
        if (isset($byKey[$k])) { $users[$byKey[$k]]['nl']++; continue; }  // тот же телефон, что у пользователя, — его заявки до входа
        $anon[$k] = $anon[$k] ?? ['id' => 0, 'name' => $l['name'], 'phone' => $l['phone'], 'key' => $k, 'nl' => 0, 'ns' => 0];
        $anon[$k]['nl']++;
    }
    reply(200, ['ok' => true, 'people' => array_merge($users, array_values($anon))]);

case 'person':  // сотрудник: карточка — человек, его заявки (и без входа с того же телефона) и сметы. uid — пользователь, phone — по телефону
    $need((bool) $me, 401);
    $need($staff);
    $p = null;
    if ($uid = (int) ($in['uid'] ?? 0)) {
        $q = $db->prepare('SELECT * FROM users WHERE id = ?');
        $q->execute([$uid]);
        $u = $q->fetch();
        $need((bool) $u, 404);
        $p = $personOf($u);
        $key = $p['key'];
    } else {
        $key = kab_phone_key($in['phone'] ?? '');
        $need($key !== '', 404);
        foreach ($db->query('SELECT * FROM users') as $u) if (kab_phone_key($u['phone']) === $key) { $p = $personOf($u); break; }  // телефон пользователя — его карточка
    }
    $ids = [];
    if ($p) {
        $q = $db->prepare('SELECT id FROM leads WHERE user_id = ?');
        $q->execute([$p['id']]);
        $ids = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    }
    if ($key !== '') foreach ($db->query('SELECT id, name, phone FROM leads WHERE user_id IS NULL ORDER BY id DESC') as $l) {
        if (kab_phone_key($l['phone']) !== $key) continue;
        $ids[] = (int) $l['id'];
        $p = $p ?? ['id' => 0, 'name' => $l['name'], 'tg_username' => '', 'phone' => $l['phone'], 'company' => '', 'role' => '', 'discount' => 0.0, 'status' => '', 'key' => $key];
    }
    $need((bool) $p, 404);
    $leads = [];
    if ($ids) {
        $q = $db->prepare($leadSql . ' WHERE l.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY l.id DESC');
        $q->execute($ids);
        $leads = array_map($leadRow, $q->fetchAll());
    }
    $smetas = [];
    if ($p['id']) {
        $q = $db->prepare($smetaSql . ' WHERE s.user_id = ? ORDER BY s.updated_at DESC');
        $q->execute([$p['id']]);
        $smetas = array_map($smetaRow, $q->fetchAll());
    }
    $pays = [];  // деньги человека — только суперадмину: документы по порядку и баланс
    $ckey = $p['id'] ? 'u' . $p['id'] : 't' . $p['key'];
    $pk = $payKeys($ckey);
    if ($admin && $pk) {
        $q = $db->prepare('SELECT p.id, p.num, p.kind, p.lead_id, p.amount, p.to_lead, p.paid_on, p.note, p.created_at, u.name, u.tg_name FROM pays p LEFT JOIN users u ON u.id = p.made_by
            WHERE p.deleted_at IS NULL AND p.ckey IN (' . implode(',', array_fill(0, count($pk), '?')) . ') ORDER BY p.paid_on, p.id');
        $q->execute($pk);
        $pays = array_map(function ($r) {
            return ['id' => (int) $r['id'], 'num' => $r['num'], 'kind' => $r['kind'], 'lead_id' => (int) $r['lead_id'], 'amount' => (float) $r['amount'], 'to_lead' => (float) $r['to_lead'],
                'paid_on' => $r['paid_on'], 'note' => (string) $r['note'], 'created_at' => $r['created_at'], 'who' => $r['name'] ?: $r['tg_name']];
        }, $q->fetchAll());
    }
    $out = ['ok' => true, 'person' => $p, 'leads' => $leads, 'smetas' => $smetas];
    if ($admin) $out += ['pays' => $pays, 'balance' => $payBal($pk), 'ckey' => $pk[0] ?? ''];
    reply(200, $out);

case 'pay_add':  // суперадмин: приходный ордер — сумма от покупателя по заказу; сверх остатка — на баланс клиента; без заказа — аванс (владелец 07.11.2026)
    $need($post, 405);
    $need($admin);
    [$amt, $on] = $payIn($in);
    if ($lid = (int) ($in['lead_id'] ?? 0)) {
        $l = $payLead($lid);
        $need((bool) $l, 404);
        $to = $l['left'] === null || !$l['keys'] ? $amt : min($amt, $l['left']);  // у заказа без суммы (или без телефона) — всё в заказ
        $ck = $l['keys'][0] ?? '';
    } else {
        $keys = $payKeys((string) ($in['client'] ?? ''));
        $need((bool) $keys, 404);
        [$to, $ck] = [0.0, $keys[0]];
    }
    $num = $payIns('in', $on, $lid, $amt, $to, $ck, (string) ($in['note'] ?? ''));
    reply(200, ['ok' => true, 'num' => $num, 'amount' => $amt, 'to_lead' => $to, 'rest' => round($amt - $to, 2)]);

case 'pay_alloc':  // суперадмин: зачёт аванса — с баланса клиента в его заказ
    $need($post, 405);
    $need($admin);
    [$amt, $on] = $payIn($in);
    $l = $payLead((int) ($in['lead_id'] ?? 0));
    $need($l && $l['keys'], 404);
    if ($amt > $payBal($l['keys']) + 0.005) reply(422, ['ok' => false, 'error' => 'balance']);
    if ($l['left'] !== null && $amt > $l['left'] + 0.005) reply(422, ['ok' => false, 'error' => 'left']);
    $num = $payIns('alloc', $on, $l['id'], $amt, $amt, $l['keys'][0], (string) ($in['note'] ?? ''));
    reply(200, ['ok' => true, 'num' => $num, 'amount' => $amt]);

case 'pay_out':  // суперадмин: выдать клиенту деньги с баланса
    $need($post, 405);
    $need($admin);
    [$amt, $on] = $payIn($in);
    $keys = $payKeys((string) ($in['client'] ?? ''));
    $need((bool) $keys, 404);
    if ($amt > $payBal($keys) + 0.005) reply(422, ['ok' => false, 'error' => 'balance']);
    $num = $payIns('out', $on, 0, $amt, 0.0, $keys[0], (string) ($in['note'] ?? ''));
    reply(200, ['ok' => true, 'num' => $num, 'amount' => $amt]);

case 'pay_del':  // суперадмин: удалить документ, внесённый по ошибке; номер остаётся занятым. Приходный, чьи деньги с баланса уже ушли, — нельзя
    $need($post, 405);
    $need($admin);
    $q = $db->prepare('SELECT * FROM pays WHERE id = ? AND deleted_at IS NULL');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $r = $q->fetch();
    $need((bool) $r, 404);
    $rest = $r['kind'] === 'in' ? (float) $r['amount'] - (float) $r['to_lead'] : 0.0;
    if ($rest > 0.005 && $payBal($payKeys((string) $r['ckey'])) - $rest < -0.005) reply(409, ['ok' => false, 'error' => 'used']);
    $db->prepare('UPDATE pays SET deleted_at = ?, deleted_by = ? WHERE id = ?')->execute([kab_now(), $me['id'], (int) $r['id']]);
    reply(200, ['ok' => true]);

case 'lead_new':  // сотрудник оформляет заявку: человеку из кабинета (user_id) или по имени и телефону, например по звонку (владелец 06.11.2026)
    $need($post, 405);
    $need($staff);
    $who = null;
    if ($uid = (int) ($in['user_id'] ?? 0)) {
        $q = $db->prepare('SELECT * FROM users WHERE id = ?');
        $q->execute([$uid]);
        $who = $q->fetch();
        $need($who && $who['status'] !== 'blocked', 404);
    }
    $name = $who ? ($who['name'] ?: $who['tg_name']) : kab_clean($in['name'] ?? '', 120);
    $phone = $who ? (string) $who['phone'] : kab_clean($in['phone'] ?? '', 40);
    if (!$who && preg_match_all('/\d/', $phone) < 7) reply(422, ['ok' => false, 'error' => 'phone']);
    $st = kab_sm_clean($in, true);
    if (!$st['items'] && !$st['extra']) reply(422, ['ok' => false, 'error' => 'empty']);
    [$rows, $sum] = kab_lead_rows($in['rows'] ?? null);
    $sm = kab_sm_json($st, ['d' => kab_disc($in['d'] ?? null), 'ud' => kab_disc($in['ud'] ?? null), 'doc' => kab_doc($in['doc'] ?? '')]);
    $db->prepare('INSERT INTO leads (user_id, created_at, name, phone, topic, page, comment, items, total, status, status_at, sm, made_by, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$who ? $who['id'] : null, kab_now(), $name, $phone, 'Заявка от AllVision', '/kabinet/', kab_clean($in['comment'] ?? '', 1000),
            json_encode($rows, JSON_UNESCAPED_UNICODE), $sum, 'work', kab_now(), $sm, $me['id'], kab_text($in['note'] ?? '', 1000)]);
    $id = (int) $db->lastInsertId();
    $sent = false;
    if ($who && !empty($in['notify']))
        $sent = kab_say($who['tg_id'], 'AllVision оформил для вас заявку №' . $id . ' на hdl.by: ' . kab_lead_money($rows, $sum) . '. Посмотреть: ' . kab_site() . '/kabinet/#leads');
    reply(200, ['ok' => true, 'id' => $id, 'sent' => $sent, 'total' => $sum, 'ver' => 0]);

case 'lead_status':
    $need($post, 405);
    $need($staff);
    $st = (string) ($in['status'] ?? '');
    $need(in_array($st, KAB_LEAD_STATUS, true), 422);
    $q = $db->prepare('UPDATE leads SET status = ?, status_at = ? WHERE id = ?');
    $q->execute([$st, kab_now(), (int) ($in['id'] ?? 0)]);
    reply(200, ['ok' => $q->rowCount() > 0]);

case 'users':  // сотрудник: все пользователи, сначала ждущие подтверждения
    $need($staff);
    $rows = $db->query("SELECT id, tg_id, tg_username, tg_name, name, phone, company, unp, role, wanted, discount, status, admin, created_at, seen_at
        FROM users ORDER BY (wanted <> '') DESC, (role = 'user' AND status = 'active') DESC, (status = 'blocked'), created_at DESC LIMIT 1000")->fetchAll();  // сначала — кому ещё не отмечены права
    // active — заявок человека не в состоянии «Закрыта» (владелец 07.11.2026: «должны видеть количество активных заказов»)
    $act = $db->query("SELECT user_id, COUNT(*) FROM leads WHERE user_id IS NOT NULL AND status <> 'closed' GROUP BY user_id")->fetchAll(PDO::FETCH_KEY_PAIR);
    $rows = array_map(function ($r) use ($act) {  // числа числами при любой версии PHP; суперадмин и владелец — флажками, номер Telegram наружу не отдаём
        $r['active'] = (int) ($act[(int) $r['id']] ?? 0);
        $r['admin'] = kab_is_admin($r);
        $r['owner'] = kab_is_owner($r);
        $r['id'] = (int) $r['id'];
        $r['discount'] = (float) $r['discount'];
        unset($r['tg_id']);
        return $r;
    }, $rows);
    reply(200, ['ok' => true, 'users' => $rows, 'me' => (int) $me['id'], 'admin' => $admin]);

case 'user_set':  // сотрудник: скидка; суперадмин ещё — подтвердить или отклонить запрос, категория (роль), суперадмин, блокировка
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT * FROM users WHERE id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $u = $q->fetch();
    $need((bool) $u, 404);
    $self = (int) $u['id'] === (int) $me['id'];
    $owner = kab_is_owner($u);
    $do = (string) ($in['do'] ?? '');
    $disc = max(0.0, min(50.0, round((float) ($in['discount'] ?? $u['discount']), 1)));
    $note = '';
    if ($do !== 'set') $need($admin);  // подтверждать, назначать суперадмина и блокировать — только суперадмин
    if ($do === 'approve' && $u['wanted'] !== '') {
        $db->prepare("UPDATE users SET role = wanted, wanted = '', discount = ?, approved_by = ?, approved_at = ? WHERE id = ?")->execute([$disc, $me['id'], kab_now(), $u['id']]);
        $note = 'Доступ на hdl.by открыт: вы — ' . KAB_ROLE_NAME[$u['wanted']] . ($disc > 0 ? ', ваша скидка ' . rtrim(rtrim(number_format($disc, 1, ',', ''), '0'), ',') . ' %' : '') . '. ' . kab_site() . '/kabinet/';
    } elseif ($do === 'reject' && $u['wanted'] !== '') {
        $db->prepare("UPDATE users SET wanted = '' WHERE id = ?")->execute([$u['id']]);
        $note = 'Запрос статуса «' . KAB_ROLE_NAME[$u['wanted']] . '» на hdl.by не подтверждён. Вопросы — +375 29 370-20-20.';
    } elseif ($do === 'set') {
        $role = $admin && in_array($in['role'] ?? '', KAB_ROLES, true) ? $in['role'] : $u['role'];  // категорию меняет суперадмин, сотрудник — только скидку
        $need((!$self && !$owner) || $role === 'staff', 409);  // себя и владельца из сотрудников не убрать — иначе некому подтверждать
        $db->prepare("UPDATE users SET role = ?, discount = ?, admin = CASE WHEN ? = 'staff' THEN admin ELSE 0 END, approved_by = ?, approved_at = ? WHERE id = ?")
            ->execute([$role, $disc, $role, $me['id'], kab_now(), $u['id']]);
        if (!$self && ($role !== $u['role'] || $disc !== (float) $u['discount'])) {  // человеку — какие права ему отметили
            $note = 'Ваши права на hdl.by: ' . KAB_ROLE_NAME[$role] . ($disc > 0 ? ', скидка ' . rtrim(rtrim(number_format($disc, 1, ',', ''), '0'), ',') . ' % от розничных цен' : '') . '. ' . kab_site() . '/kabinet/';
        }
    } elseif ($do === 'admin' || $do === 'unadmin') {  // суперадмином делают только действующего сотрудника; владельца и себя не меняют
        $need(kab_is_staff($u) && !$owner && !$self, 409);
        $db->prepare('UPDATE users SET admin = ? WHERE id = ?')->execute([$do === 'admin' ? 1 : 0, $u['id']]);
        $note = $do === 'admin' ? 'Вы — суперадмин на hdl.by: можете блокировать пользователей и назначать категории. ' . kab_site() . '/kabinet/'
            : 'Права суперадмина на hdl.by сняты, вы — сотрудник AllVision.';
    } elseif ($do === 'block' || $do === 'unblock') {
        $need(!$self && !$owner, 409);
        $db->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$do === 'block' ? 'blocked' : 'active', $u['id']]);
        if ($do === 'block') $db->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$u['id']]);
    } else {
        reply(422, ['ok' => false, 'error' => 'do']);
    }
    if ($note !== '') kab_say($u['tg_id'], $note);
    reply(200, ['ok' => true]);

case 'files':  // документы: свои; сотрудник — все. Материалы — только сотрудникам
    $need((bool) $me, 401);
    $kind = ($in['kind'] ?? '') === 'mat' ? 'mat' : 'doc';
    if ($kind === 'mat') $need($staff);
    $q = $db->prepare('SELECT f.id, f.user_id, f.object, f.title, f.name, f.size, f.created_at, u.name AS uname, u.tg_name, u.company
        FROM files f LEFT JOIN users u ON u.id = f.user_id WHERE f.kind = ?' . ($staff ? '' : ' AND f.user_id = ?') . ' ORDER BY f.created_at DESC, f.id DESC LIMIT 3000');
    $q->execute($staff ? [$kind] : [$kind, $me['id']]);
    $rows = array_map(function ($r) { $r['id'] = (int) $r['id']; $r['user_id'] = (int) $r['user_id']; $r['size'] = (int) $r['size']; return $r; }, $q->fetchAll());
    reply(200, ['ok' => true, 'files' => $rows] + ($staff ? ['max' => kab_upload_max(), 'ext' => KAB_FILE_EXT] : []));

case 'upload':  // сотрудник: один файл за запрос (поле file); kind=doc — клиенту user_id по объекту object, kind=mat — в раздел object
    $need($post, 405);
    $need($staff);
    $max = kab_upload_max();
    $kind = ($in['kind'] ?? '') === 'mat' ? 'mat' : 'doc';
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || is_array($file['name'] ?? null)) reply(422, ['ok' => false, 'error' => (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max ? 'size' : 'file', 'max' => $max]);
    if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) reply(422, ['ok' => false, 'error' => 'size', 'max' => $max]);
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) reply(422, ['ok' => false, 'error' => 'file']);
    $name = kab_clean(basename(str_replace('\\', '/', (string) $file['name'])), 160);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, KAB_FILE_EXT, true)) reply(422, ['ok' => false, 'error' => 'type']);
    $owner = null;
    if ($kind === 'doc') {
        $q = $db->prepare('SELECT * FROM users WHERE id = ?');
        $q->execute([(int) ($in['user_id'] ?? 0)]);
        $owner = $q->fetch();
        $need((bool) $owner, 404);
    }
    $rel = 'files/' . ($owner ? 'docs/' . (int) $owner['id'] : 'materials');
    if (!is_dir(kab_dir() . '/' . $rel)) @mkdir(kab_dir() . '/' . $rel, 0750, true);
    $path = $rel . '/' . bin2hex(random_bytes(12)) . '.' . $ext;  // имя на диске случайное, своё имя файла — в базе
    if (!move_uploaded_file($file['tmp_name'], kab_dir() . '/' . $path)) { kab_log('загрузка: не удалось сохранить ' . $path); reply(500, ['ok' => false, 'error' => 'save']); }
    $title = kab_clean($in['title'] ?? '', 160) ?: (string) preg_replace('/\.[^.]+$/', '', $name);
    $object = kab_clean($in['object'] ?? '', 120);
    $db->prepare('INSERT INTO files (kind, user_id, object, title, name, path, size, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$kind, $owner ? $owner['id'] : null, $object, $title, $name, $path, (int) filesize(kab_dir() . '/' . $path), $me['id'], kab_now()]);
    $id = (int) $db->lastInsertId();
    $more = (int) ($in['notify'] ?? 0);  // на последнем файле пачки — сколько файлов загрузили, 0 — не сообщать
    if ($owner && $more > 0) {
        kab_say($owner['tg_id'], 'В кабинете hdl.by ' . ($more > 1 ? 'новые документы' : 'новый документ') . ($object ? ' по объекту «' . $object . '»' : '')
            . ': ' . $title . ($more > 1 ? ' и ещё ' . ($more - 1) : '') . '. ' . kab_site() . '/kabinet/#docs');
    }
    reply(200, ['ok' => true, 'id' => $id]);

case 'file':  // выдача файла: сотруднику — любой, клиенту — только свой документ. pdf и картинки открываются в браузере, остальное скачивается
    $need((bool) $me, 401);
    $q = $db->prepare('SELECT * FROM files WHERE id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $f = $q->fetch();
    $need($f && ($staff || ($f['kind'] === 'doc' && (int) $f['user_id'] === (int) $me['id'])), 404);
    $full = kab_dir() . '/' . $f['path'];
    $need(is_file($full), 404);
    if (ob_get_level()) ob_end_clean();
    $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
    $inline = array_key_exists($ext, KAB_FILE_INLINE);
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $f['name']) ?: 'file.' . $ext;
    header('Content-Type: ' . ($inline ? KAB_FILE_INLINE[$ext] : 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($full));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8' . "''" . rawurlencode((string) $f['name']));
    header('Cache-Control: private, no-store');
    readfile($full);
    exit;

case 'file_del':
    $need($post, 405);
    $need($staff);
    $q = $db->prepare('SELECT * FROM files WHERE id = ?');
    $q->execute([(int) ($in['id'] ?? 0)]);
    $f = $q->fetch();
    $need((bool) $f, 404);
    @unlink(kab_dir() . '/' . $f['path']);
    $db->prepare('DELETE FROM files WHERE id = ?')->execute([$f['id']]);
    reply(200, ['ok' => true]);

default:
    reply(404, ['ok' => false, 'error' => 'action']);
}
} catch (Throwable $e) {
    kab_log($a . ': ' . $e->getMessage());
    reply(500, ['ok' => false]);
}
