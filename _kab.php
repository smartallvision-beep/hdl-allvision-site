<?php
// Общее для кабинета hdl.by (kab.php) и заявок (lead.php): настройки, база SQLite вне папки сайта, вход по Telegram, сообщения бота.
// Сам по себе ничего не делает: подключается из kab.php и lead.php. Пишется под PHP 7.4+ (версия на хостинге не задана).
// Роли (владелец 03.11.2026): client — клиент, dealer — дилер, staff — сотрудник AllVision. Дилер и сотрудник — после подтверждения сотрудником.
declare(strict_types=1);
if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) { http_response_code(404); exit; }

const KAB_ROLES = ['client', 'dealer', 'staff'];
const KAB_LEAD_STATUS = ['new', 'work', 'kp', 'closed'];
const KAB_SESSION_DAYS = 90;

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
    $db->exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)");
    $db->exec("CREATE TABLE IF NOT EXISTS smetas (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT, items TEXT, created_at TEXT, updated_at TEXT)");
    $db->exec("CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT,
        name TEXT, phone TEXT, topic TEXT, page TEXT, comment TEXT, items TEXT, total INTEGER, status TEXT DEFAULT 'new', status_at TEXT)");
    return $db;
}

function kab_now(): string { return date('Y-m-d H:i:s'); }

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

const KAB_ROLE_NAME = ['client' => 'клиент', 'dealer' => 'дилер', 'staff' => 'сотрудник AllVision'];
const KAB_STATUS_NAME = ['new' => 'Новая', 'work' => 'В работе', 'kp' => 'КП отправлено', 'closed' => 'Закрыта'];

function kab_who(array $u): string {
    return trim(($u['name'] ?: $u['tg_name']) . ($u['tg_username'] ? ' (@' . $u['tg_username'] . ')' : ''));
}
