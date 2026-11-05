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
$in = $post ? ($a === 'upload' ? $_POST : json_decode((string) file_get_contents('php://input'), true)) : $_GET;  // загрузка файла — форма, остальное — JSON
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
    $q = $db->prepare('SELECT s.id, s.user_id, s.title, s.doc, s.disc, s.made_by, s.items, s.updated_at, u.name, u.company, u.role, m.name AS made_name, m.tg_name AS made_tg
        FROM smetas s JOIN users u ON u.id = s.user_id LEFT JOIN users m ON m.id = s.made_by' . ($all ? '' : ' WHERE s.user_id = ?') . ' ORDER BY s.updated_at DESC LIMIT 300');
    $q->execute($all ? [] : [$me['id']]);
    $rows = array_map(function ($r) use ($staff) {
        $r['items'] = json_decode((string) $r['items']) ?: new stdClass();
        $r['id'] = (int) $r['id'];
        $r['user_id'] = (int) $r['user_id'];
        $r['disc'] = $r['disc'] === null ? null : (float) $r['disc'];
        $r['made_by'] = $r['made_by'] === null ? null : (int) $r['made_by'];
        $r['made_name'] = $staff && $r['made_by'] ? ($r['made_name'] ?: $r['made_tg']) : null;  // клиенту — только что смету подготовила AllVision
        unset($r['made_tg']);
        return $r;
    }, $q->fetchAll());
    reply(200, ['ok' => true, 'smetas' => $rows]);

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
    $items = [];
    foreach (array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 300, true) as $art => $qty) {
        $art = kab_clean($art, 80);
        if ($art !== '') $items[$art] = max(1, min(9999, (int) $qty));
    }
    if (!$items) reply(422, ['ok' => false, 'error' => 'empty']);
    $title = kab_clean($in['title'] ?? '', 120) ?: 'Смета от ' . date('d.m.Y');
    $doc = kab_clean($in['doc'] ?? '', 80);  // название документа — только из списка сотрудников
    $q = $db->prepare('SELECT 1 FROM doc_titles WHERE title = ?');
    $q->execute([$doc]);
    if (!$q->fetchColumn()) $doc = '';
    $disc = $for ? max(0.0, min(50.0, round((float) ($in['disc'] ?? 0), 1))) : null;
    $json = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT);
    $id = (int) ($in['id'] ?? 0);
    if ($id) {  // своя — только своя; клиенту — смета этого человека (сотрудник правит открытую из кабинета)
        $q = $for ? $db->prepare('UPDATE smetas SET title = ?, doc = ?, items = ?, disc = ?, made_by = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            : $db->prepare('UPDATE smetas SET title = ?, doc = ?, items = ?, updated_at = ? WHERE id = ? AND user_id = ?');
        $q->execute($for ? [$title, $doc, $json, $disc, $me['id'], kab_now(), $id, $owner['id']] : [$title, $doc, $json, kab_now(), $id, $me['id']]);
        $need($q->rowCount() > 0, 404);
    } else {
        $n = $db->prepare('SELECT COUNT(*) FROM smetas WHERE user_id = ?');
        $n->execute([$owner['id']]);
        if ((int) $n->fetchColumn() >= 100) reply(422, ['ok' => false, 'error' => 'limit']);
        $db->prepare('INSERT INTO smetas (user_id, title, doc, items, disc, made_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$owner['id'], $title, $doc, $json, $disc, $for ? $me['id'] : null, kab_now(), kab_now()]);
        $id = (int) $db->lastInsertId();
    }
    $sent = false;
    if ($for && !empty($in['notify'])) {  // написать боту можно, только если человек разрешил при входе
        $what = $doc !== '' ? mb_strtolower(mb_substr($doc, 0, 1)) . mb_substr($doc, 1) : 'смету';
        $sent = kab_say($owner['tg_id'], 'AllVision подготовил для вас ' . $what . ' «' . $title . '» на hdl.by: ' . count($items) . ' поз.'
            . ($disc > 0 ? ', скидка ' . rtrim(rtrim(number_format($disc, 1, ',', ''), '0'), ',') . ' %' : '') . '. Открыть: ' . kab_site() . '/kabinet/#smetas');
    }
    reply(200, ['ok' => true, 'id' => $id, 'title' => $title, 'sent' => $sent]);

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

case 'leads':  // свои заявки; сотрудник — все заявки с сайта
    $need((bool) $me, 401);
    $q = $db->prepare('SELECT l.id, l.created_at, l.name, l.phone, l.topic, l.page, l.comment, l.items, l.total, l.status, l.status_at, u.role, u.company, u.tg_username
        FROM leads l LEFT JOIN users u ON u.id = l.user_id' . ($staff ? '' : ' WHERE l.user_id = ?') . ' ORDER BY l.id DESC LIMIT 300');
    $q->execute($staff ? [] : [$me['id']]);
    $rows = $q->fetchAll();
    if (!$staff) $rows = array_map(function ($r) { unset($r['role'], $r['company'], $r['tg_username']); return $r; }, $rows);
    reply(200, ['ok' => true, 'leads' => $rows]);

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
    $rows = array_map(function ($r) {  // числа числами при любой версии PHP; суперадмин и владелец — флажками, номер Telegram наружу не отдаём
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
