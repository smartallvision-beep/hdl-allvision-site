<?php
// Общее для кабинета hdl.by (kab.php) и заявок (lead.php): настройки, база SQLite вне папки сайта, вход по Telegram, сообщения бота.
// Сам по себе ничего не делает: подключается из kab.php и lead.php. Пишется под PHP 7.4+ (версия на хостинге не задана).
// Роли (владелец 03.11.2026): user — пользователь (так регистрируются все), client — клиент, dealer — дилер, staff — сотрудник AllVision; права отмечает сотрудник.
declare(strict_types=1);
if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const KAB_ROLES = ['user', 'client', 'dealer', 'staff'];  // user — после регистрации; остальное отмечает сотрудник
const KAB_LEAD_STATUS = ['new', 'work', 'kp', 'closed'];
const KAB_SESSION_DAYS = 90;
// файлы кабинета (этап 2): документы по объекту клиента и материалы сотрудников. Только эти расширения; html, svg, php, exe — нет
const KAB_FILE_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar', '7z', 'dwg', 'dxf'];
const KAB_FILE_INLINE = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];

// config.php правят руками на сервере; для проверки на компьютере путь к другому файлу — в переменной окружения HDL_CONFIG
function kab_cfg(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $cfg = [];
    $file = getenv('HDL_CONFIG') ?: __DIR__ . '/config.php';
    if (is_file($file)) {
        try { $c = require $file; } catch (Throwable $e) { $c = []; kab_log('ошибка в config.php, строка ' . $e->getLine() . ': ' . $e->getMessage()); }
        if (is_array($c)) $cfg = array_map(function ($v) { return is_string($v) ? trim($v) : $v; }, $c);
    }
    return $cfg;
}

function kab_dir(): string {
    $dir = kab_cfg()['data_dir'] ?? dirname(__DIR__) . '/hdl-data';  // вне папки сайта: базу нельзя скачать по ссылке
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    return $dir;
}

function kab_log(string $msg): void {
    $dir = kab_cfg()['data_dir'] ?? dirname(__DIR__) . '/hdl-data';
    @file_put_contents($dir . '/kab-errors.log', date('Y-m-d H:i:s') . ' ' . $msg . "\n", FILE_APPEND);
}

function kab_db(): PDO {
    static $db = null;
    if ($db) return $db;
    $db = new PDO('sqlite:' . kab_dir() . '/kabinet.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, tg_id INTEGER UNIQUE NOT NULL, tg_username TEXT DEFAULT '', tg_name TEXT DEFAULT '',
        name TEXT DEFAULT '', phone TEXT DEFAULT '', company TEXT DEFAULT '', unp TEXT DEFAULT '',
        role TEXT DEFAULT 'client', wanted TEXT DEFAULT '', discount REAL DEFAULT 0, status TEXT DEFAULT 'form',
        consent_at TEXT DEFAULT '', created_at TEXT, seen_at TEXT, approved_by INTEGER, approved_at TEXT)");
    // суперадмин (владелец 05.11.2026): столбец добавляется и в уже созданную базу
    if (!in_array('admin', array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name'), true)) $db->exec('ALTER TABLE users ADD COLUMN admin INTEGER DEFAULT 0');
    $db->exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS smetas (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT, items TEXT, created_at TEXT, updated_at TEXT)");
    $db->exec("CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT,
        name TEXT, phone TEXT, topic TEXT, page TEXT, comment TEXT, items TEXT, total INTEGER, status TEXT DEFAULT 'new', status_at TEXT)");
    // названия документа для печати сметы — общий список сотрудников (владелец 05.11.2026); при создании таблицы — два частых
    $newTitles = !$db->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'doc_titles'")->fetchColumn();
    $db->exec("CREATE TABLE IF NOT EXISTS doc_titles (id INTEGER PRIMARY KEY, title TEXT UNIQUE NOT NULL, created_by INTEGER, created_at TEXT)");
    if ($newTitles) foreach (['Коммерческое предложение', 'Заказ покупателя'] as $t) $db->prepare('INSERT OR IGNORE INTO doc_titles (title, created_at) VALUES (?, ?)')->execute([$t, date('Y-m-d H:i:s')]);
    // название документа идёт вместе со сметой: «Открыть» в кабинете показывает его и клиенту
    // смета клиенту от сотрудника (этап 2, владелец 05.11.2026): disc — скидка в смете вместо личной (NULL — личная), made_by — кто подготовил
    $smCols = array_column($db->query('PRAGMA table_info(smetas)')->fetchAll(), 'name');
    if (!in_array('doc', $smCols, true)) $db->exec("ALTER TABLE smetas ADD COLUMN doc TEXT DEFAULT ''");
    if (!in_array('disc', $smCols, true)) $db->exec('ALTER TABLE smetas ADD COLUMN disc REAL');
    if (!in_array('made_by', $smCols, true)) $db->exec('ALTER TABLE smetas ADD COLUMN made_by INTEGER');
    // ассортимент из кабинета (этап 3, владелец 05.11.2026): одна правка на артикул — название, розничная цена USD с НДС (NULL — как в прайсе),
    // описание, фото, «скрыть»; is_new — новая позиция (раздел gnum, система platform). synced_at — когда компьютер AllVision забрал её в сборку;
    // deleted — правку отменили, уходит со следующей сборкой. kv — запрос «Обновить сайт сейчас» и итог последней сборки
    $db->exec("CREATE TABLE IF NOT EXISTS cat_edits (art TEXT PRIMARY KEY, is_new INTEGER DEFAULT 0, name TEXT DEFAULT '', price REAL, about TEXT DEFAULT '',
        hidden INTEGER DEFAULT 0, gnum TEXT DEFAULT '', platform TEXT DEFAULT '', photo TEXT DEFAULT '', deleted INTEGER DEFAULT 0, updated_by INTEGER, updated_at TEXT, synced_at TEXT)");
    $db->exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    // kind: doc — документ клиента (user_id, object — объект), mat — материал сотрудников (object — раздел). path — относительно папки данных
    $db->exec("CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        object TEXT DEFAULT '', title TEXT, name TEXT, path TEXT, size INTEGER, uploaded_by INTEGER, created_at TEXT)");
    return $db;
}

function kab_now(): string { return date('Y-m-d H:i:s'); }

function kab_kv_get(string $k): ?array {
    $q = kab_db()->prepare('SELECT v FROM kv WHERE k = ?');
    $q->execute([$k]);
    $v = $q->fetchColumn();
    return $v === false ? null : (json_decode((string) $v, true) ?: null);
}
function kab_kv_set(string $k, ?array $v): void {
    if ($v === null) kab_db()->prepare('DELETE FROM kv WHERE k = ?')->execute([$k]);
    else kab_db()->prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
}

// компьютер сборки AllVision (cabinet_sync.py) — по ключу build_key из config.php в заголовке X-HDL-Key, без входа в кабинет
function kab_build_ok(): bool {
    $k = (string) (kab_cfg()['build_key'] ?? '');
    return strlen($k) >= 32 && hash_equals($k, (string) ($_SERVER['HTTP_X_HDL_KEY'] ?? ''));
}

// разделы каталога для новых позиций (data.GROUPS) и системы (data.PLATFORMS)
const KAB_CAT_GROUPS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '21', '22', '23', '24', '25', '26', '27', '28'];
const KAB_CAT_PLATFORMS = ['buspro', 'knx', 'wireless'];
const KAB_CAT_PHOTO = ['jpg', 'jpeg', 'png', 'webp'];

// предел загрузки файла на хостинге: меньшее из upload_max_filesize и post_max_size (меняется в cPanel → PHP)
function kab_ini_bytes(string $v): int {
    $v = trim($v);
    $n = (int) $v;
    switch (strtolower(substr($v, -1))) {
        case 'g': $n *= 1024;  // дальше без break: гигабайты → мегабайты → килобайты
        case 'm': $n *= 1024;
        case 'k': $n *= 1024;
    }
    return $n;
}

function kab_upload_max(): int {
    $a = kab_ini_bytes((string) ini_get('upload_max_filesize'));
    $b = kab_ini_bytes((string) ini_get('post_max_size'));
    return $b > 0 ? min($a, $b) : $a;
}

function kab_clean($v, int $max): string {
    return mb_substr(trim((string) preg_replace('/\s+/u', ' ', (string) $v)), 0, $max);
}

function kab_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

// вход: случайный ключ в cookie (только для сервера), в базе — его хеш. hdl_in — подсказка скрипту сайта, что вход выполнен (без секрета)
function kab_cookie(string $name, string $value, int $expires, bool $httpOnly): void {
    setcookie($name, $value, ['expires' => $expires, 'path' => '/', 'secure' => kab_https(), 'httponly' => $httpOnly, 'samesite' => 'Lax']);
}

function kab_start_session(int $userId): void {
    $token = bin2hex(random_bytes(32));
    $exp = time() + KAB_SESSION_DAYS * 86400;
    $db = kab_db();
    $db->prepare('DELETE FROM sessions WHERE expires < ?')->execute([time()]);
    $db->prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)')->execute([hash('sha256', $token), $userId, $exp]);
    kab_cookie('hdl_s', $token, $exp, true);
    kab_cookie('hdl_in', '1', $exp, false);
}

function kab_end_session(): void {
    $t = (string) ($_COOKIE['hdl_s'] ?? '');
    if ($t !== '') kab_db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([hash('sha256', $t)]);
    kab_cookie('hdl_s', '', time() - 3600, true);
    kab_cookie('hdl_in', '', time() - 3600, false);
}

// текущий пользователь или null; заблокированный — как не вошедший
function kab_user(): ?array {
    static $done = false, $user = null;
    if ($done) return $user;
    $done = true;
    $t = (string) ($_COOKIE['hdl_s'] ?? '');
    if (!preg_match('/^[0-9a-f]{64}$/', $t)) return null;
    $q = kab_db()->prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?');
    $q->execute([hash('sha256', $t), time()]);
    $u = $q->fetch();
    if (!$u || $u['status'] === 'blocked') return null;
    if (substr((string) $u['seen_at'], 0, 10) !== date('Y-m-d')) kab_db()->prepare('UPDATE users SET seen_at = ? WHERE id = ?')->execute([kab_now(), $u['id']]);
    return $user = $u;
}

function kab_is_staff(?array $u): bool { return $u && $u['role'] === 'staff' && $u['status'] === 'active'; }

// суперадмин (владелец 05.11.2026): блокирует, назначает категории и других суперадминов. Владелец (tg_chat — его личный id) — всегда,
// другие — сотрудники, которых отметил суперадмин. Остальные сотрудники видят всё, ставят скидки, ведут заявки и документы
function kab_owner_id(): int { $c = (string) (kab_cfg()['tg_chat'] ?? ''); return preg_match('/^\d+$/', $c) ? (int) $c : 0; }
function kab_is_owner(?array $u): bool { return $u && kab_owner_id() > 0 && (int) $u['tg_id'] === kab_owner_id(); }
function kab_is_admin(?array $u): bool { return kab_is_staff($u) && ((int) ($u['admin'] ?? 0) === 1 || kab_is_owner($u)); }

// сотрудники без подтверждения: владелец (tg_chat в config.php — его личный id) и список staff_ids
function kab_staff_ids(): array {
    $c = kab_cfg();
    $ids = array_map('intval', (array) ($c['staff_ids'] ?? []));
    if (preg_match('/^\d+$/', (string) ($c['tg_chat'] ?? ''))) $ids[] = (int) $c['tg_chat'];
    return array_values(array_unique(array_filter($ids)));
}

// проверка данных кнопки «Войти через Telegram»: подпись ключом из токена бота, не старше суток
function kab_tg_check(array $d): ?array {
    $token = (string) (kab_cfg()['tg_token'] ?? '');
    $hash = (string) ($d['hash'] ?? '');
    if ($token === '' || $hash === '' || empty($d['id']) || empty($d['auth_date'])) return null;
    $pairs = [];
    foreach ($d as $k => $v) {
        if ($k === 'hash' || !in_array($k, ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'], true)) continue;
        $pairs[] = $k . '=' . $v;
    }
    sort($pairs, SORT_STRING);
    $calc = hash_hmac('sha256', implode("\n", $pairs), hash('sha256', $token, true));
    if (!hash_equals($calc, $hash) || time() - (int) $d['auth_date'] > 86400) return null;
    return $d;
}

// вход по проверенным данным Telegram (прежняя кнопка — kab.php, новый вход — tg.php): найти или завести пользователя, отметить сотрудника,
// начать сессию. Заблокированный — null
function kab_tg_enter(int $tgId, string $username, string $name): ?array {
    $db = kab_db();
    $q = $db->prepare('SELECT * FROM users WHERE tg_id = ?');
    $q->execute([$tgId]);
    $u = $q->fetch();
    if ($u && $u['status'] === 'blocked') return null;
    $username = kab_clean($username, 64);
    $name = kab_clean($name, 80);
    if ($u) {
        $db->prepare('UPDATE users SET tg_username = ?, tg_name = ?, seen_at = ? WHERE id = ?')->execute([$username, $name, kab_now(), $u['id']]);
        $id = (int) $u['id'];
    } else {
        $db->prepare("INSERT INTO users (tg_id, tg_username, tg_name, role, created_at, seen_at) VALUES (?, ?, ?, 'user', ?, ?)")
            ->execute([$tgId, $username, $name, kab_now(), kab_now()]);
        $id = (int) $db->lastInsertId();
    }
    if (in_array($tgId, kab_staff_ids(), true)) $db->prepare("UPDATE users SET role = 'staff', wanted = '' WHERE id = ?")->execute([$id]);
    kab_start_session($id);
    $q = $db->prepare('SELECT * FROM users WHERE id = ?');
    $q->execute([$id]);
    return $q->fetch() ?: null;
}

// номер бота — начало токена до двоеточия (не секрет). Новый вход Telegram (tg.php) включается, когда в config.php есть tg_secret;
// Client ID — номер бота, если @BotFather показывает другой — tg_client в config.php
function kab_bot_id(): int { return (int) strstr((string) (kab_cfg()['tg_token'] ?? ''), ':', true); }
function kab_oidc_client(): string { return (string) ((int) (kab_cfg()['tg_client'] ?? 0) ?: kab_bot_id()); }
function kab_oidc_on(): bool { return kab_oidc_client() !== '0' && (string) (kab_cfg()['tg_secret'] ?? '') !== ''; }

// имя бота для кнопки входа: из config.php (tg_bot) или у Telegram по токену, запоминается в папке данных
function kab_bot_name(): string {
    $c = kab_cfg();
    if (!empty($c['tg_bot'])) return ltrim((string) $c['tg_bot'], '@');
    $file = kab_dir() . '/bot-name.txt';
    if (is_file($file) && filemtime($file) > time() - 86400) return trim((string) file_get_contents($file));
    $res = kab_tg('getMe', []);
    $name = (string) ($res['result']['username'] ?? '');
    if ($name !== '') @file_put_contents($file, $name);
    return $name;
}

function kab_tg(string $method, array $params): ?array {
    $token = (string) (kab_cfg()['tg_token'] ?? '');
    if ($token === '' || !function_exists('curl_init')) return null;
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/' . $method);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_POSTFIELDS => $params]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    if (PHP_VERSION_ID < 80000) curl_close($ch);  // с PHP 8.0 не нужен, в 8.5 устарел
    $res = json_decode((string) $raw, true);
    if (empty($res['ok'])) kab_log('Telegram ' . $method . ': ' . ($err ?: mb_substr((string) $raw, 0, 300)));
    return is_array($res) ? $res : null;
}

// сообщение сотрудникам (в чат заявок) или пользователю (если он разрешил боту писать при входе)
function kab_say($chat, string $text): bool {
    if ((string) $chat === '') return false;
    $res = kab_tg('sendMessage', ['chat_id' => (string) $chat, 'text' => mb_substr($text, 0, 4000), 'disable_web_page_preview' => 'true']);
    return !empty($res['ok']);
}

function kab_site(): string { return 'https://' . (kab_cfg()['site_host'] ?? 'hdl.by'); }

const KAB_ROLE_NAME = ['user' => 'пользователь', 'client' => 'клиент', 'dealer' => 'дилер', 'staff' => 'сотрудник AllVision'];
const KAB_STATUS_NAME = ['new' => 'Новая', 'work' => 'В работе', 'kp' => 'КП отправлено', 'closed' => 'Закрыта'];

function kab_who(array $u): string {
    return trim(($u['name'] ?: $u['tg_name']) . ($u['tg_username'] ? ' (@' . $u['tg_username'] . ')' : ''));
}
