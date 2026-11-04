<?php
// Новый вход Telegram — OpenID Connect (владелец 04.11.2026: «Пользователь вносит данные и на телеграмм подтверждает. Но на сайте по прежнему
// остается висеть войти»). Без всплывающих окон и рамок: /tg.php → страница Telegram в этой же вкладке → Telegram возвращает сюда с code →
// сервер меняет code на id_token, проверяет подпись ключами Telegram → сессия → /kabinet/. Работает, когда в config.php есть tg_secret;
// без него кабинет показывает прежнюю кнопку. В @BotFather (мини-приложение → бот → Login Widget) — Allowed URLs: https://hdl.by
// и https://hdl.by/tg.php, оттуда же Client Secret.
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/_kab.php';

// в кабинет; причину неудачи (#tg=…) показывает app.js
function tg_back(string $why = ''): void {
    header('Cache-Control: no-store');
    header('Location: /kabinet/' . ($why !== '' ? '#tg=' . $why : ''), true, 303);
    exit;
}

function tg_b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function tg_unb64u(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

function tg_http(string $url, ?array $post = null, array $headers = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => $headers]
        + ($post !== null ? [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($post)] : []));
    $raw = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    if (PHP_VERSION_ID < 80000) curl_close($ch);
    return [$code, json_decode($raw, true), $err ?: mb_substr($raw, 0, 300)];
}

// открытый ключ RSA из набора ключей Telegram (n, e) → PEM для openssl_verify
function tg_pem(string $n, string $e): string {
    $len = function (int $l): string { return $l < 128 ? chr($l) : ($l < 256 ? "\x81" . chr($l) : "\x82" . pack('n', $l)); };
    $int = function (string $b) use ($len): string { if (ord($b[0]) > 127) $b = "\0" . $b; return "\x02" . $len(strlen($b)) . $b; };
    $seq = function (string $b) use ($len): string { return "\x30" . $len(strlen($b)) . $b; };
    $rsa = $seq($int(tg_unb64u($n)) . $int(tg_unb64u($e)));
    $spki = $seq($seq("\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00") . "\x03" . $len(strlen($rsa) + 1) . "\0" . $rsa);
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

// ключи Telegram — на сутки в папке данных; подпись не сошлась со старыми — скачать заново и проверить ещё раз
function tg_signed(string $data, string $sig, string $base): bool {
    $file = kab_dir() . '/tg-jwks.json';
    foreach ([false, true] as $fresh) {
        $keys = !$fresh && is_file($file) && filemtime($file) > time() - 86400 ? json_decode((string) file_get_contents($file), true) : null;
        if (!is_array($keys)) {
            [$code, $j] = tg_http($base . '/.well-known/jwks.json');
            $keys = $code === 200 && is_array($j['keys'] ?? null) ? $j['keys'] : [];
            if ($keys) @file_put_contents($file, json_encode($keys));
        }
        foreach ($keys as $k) {
            if (($k['kty'] ?? '') === 'RSA' && !empty($k['n']) && !empty($k['e'])
                && openssl_verify($data, $sig, tg_pem((string) $k['n'], (string) $k['e']), OPENSSL_ALGO_SHA256) === 1) return true;
        }
    }
    return false;
}

$cfg = kab_cfg();
$client = kab_oidc_client();
$base = rtrim((string) ($cfg['tg_oauth'] ?? 'https://oauth.telegram.org'), '/');  // другой адрес — только для проверки на компьютере
$host = (string) ($cfg['site_host'] ?? 'hdl.by');
$self = (kab_https() ? 'https://' : 'http://') . $host . '/tg.php';
if (!kab_oidc_on() || !function_exists('curl_init') || !function_exists('openssl_verify')) tg_back('off');
$opt = ['path' => '/tg.php', 'secure' => kab_https(), 'httponly' => true, 'samesite' => 'Lax'];

// начало: с www и других имён — на основной адрес, чтобы cookie и адрес возврата совпали
if (!isset($_GET['code']) && !isset($_GET['error'])) {
    if (strcasecmp((string) ($_SERVER['HTTP_HOST'] ?? ''), $host) !== 0) { header('Location: ' . $self, true, 302); exit; }
    $state = tg_b64u(random_bytes(24));
    $verifier = tg_b64u(random_bytes(48));
    setcookie('hdl_tg', $state . '.' . $verifier, ['expires' => time() + 1800] + $opt);
    header('Cache-Control: no-store');
    header('Location: ' . $base . '/auth?' . http_build_query(['client_id' => $client, 'redirect_uri' => $self, 'response_type' => 'code',
        'scope' => 'openid profile telegram:bot_access', 'state' => $state, 'code_challenge' => tg_b64u(hash('sha256', $verifier, true)),
        'code_challenge_method' => 'S256'], '', '&', PHP_QUERY_RFC3986), true, 302);
    exit;
}

// возврат из Telegram
[$state, $verifier] = array_pad(explode('.', (string) ($_COOKIE['hdl_tg'] ?? ''), 2), 2, '');
setcookie('hdl_tg', '', ['expires' => time() - 3600] + $opt);
if (isset($_GET['error'])) tg_back('cancel');
if ($state === '' || !hash_equals($state, (string) ($_GET['state'] ?? ''))) {
    kab_log('вход Telegram: state не совпал (вход начат в другом браузере или устарел)');
    tg_back('again');
}
try {
    [$code, $tok, $err] = tg_http($base . '/token', ['grant_type' => 'authorization_code', 'code' => (string) $_GET['code'], 'redirect_uri' => $self,
        'client_id' => $client, 'code_verifier' => $verifier],
        ['Authorization: Basic ' . base64_encode($client . ':' . (string) $cfg['tg_secret']), 'Content-Type: application/x-www-form-urlencoded']);
    $p = explode('.', (string) ($tok['id_token'] ?? ''));
    $head = count($p) === 3 ? json_decode(tg_unb64u($p[0]), true) : null;
    $c = count($p) === 3 ? json_decode(tg_unb64u($p[1]), true) : null;
    if (!is_array($c) || ($head['alg'] ?? '') !== 'RS256' || !tg_signed($p[0] . '.' . $p[1], tg_unb64u($p[2]), $base)) {
        kab_log('вход Telegram: обмен code — ' . $code . ' ' . (is_array($c) ? 'подпись id_token не сошлась' : $err));
        tg_back('fail');
    }
    if (($c['iss'] ?? '') !== 'https://oauth.telegram.org' || !in_array($client, array_map('strval', (array) ($c['aud'] ?? [])), true)
        || (int) ($c['exp'] ?? 0) < time() - 60 || empty($c['id'])) {
        kab_log('вход Telegram: в id_token не тот бот, устарел или нет id (нужна область profile)');
        tg_back('fail');
    }
    $name = (string) ($c['name'] ?? trim(($c['given_name'] ?? '') . ' ' . ($c['family_name'] ?? '')));
    $u = kab_tg_enter((int) $c['id'], (string) ($c['preferred_username'] ?? ''), $name);
} catch (Throwable $e) {
    kab_log('вход Telegram: ' . $e->getMessage());
    tg_back('fail');
}
if (!$u) tg_back('blocked');
tg_back();
