<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function fetchLocalResource(string $url, int $maximumBytes = 1048576): array
{
    $body = '';
    $contentType = '';
    $status = 0;

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_USERAGENT => 'Roam Local WAMP Icons/1.2.0',
            CURLOPT_RANGE => '0-' . ($maximumBytes - 1),
        ]);
        $result = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $contentType = trim((string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE));
        curl_close($curl);
        if (is_string($result)) $body = $result;
    } else {
        $context = stream_context_create([
            'http' => [
                'timeout' => 6,
                'follow_location' => 1,
                'max_redirects' => 3,
                'header' => "User-Agent: Roam Local WAMP Icons/1.2.0\r\n",
            ],
        ]);
        $result = @file_get_contents($url, false, $context, 0, $maximumBytes);
        if (is_string($result)) {
            $body = $result;
            $status = 200;
        }
    }

    return ['body' => $body, 'contentType' => $contentType, 'status' => $status];
}

function resolveUrl(string $baseUrl, string $reference): string
{
    if (preg_match('~^https?://~i', $reference)) return $reference;
    if (str_starts_with($reference, '//')) {
        return (string) parse_url($baseUrl, PHP_URL_SCHEME) . ':' . $reference;
    }

    $scheme = (string) parse_url($baseUrl, PHP_URL_SCHEME);
    $host = (string) parse_url($baseUrl, PHP_URL_HOST);
    $port = parse_url($baseUrl, PHP_URL_PORT);
    $origin = $scheme . '://' . $host . ($port ? ':' . $port : '');

    if (str_starts_with($reference, '/')) return $origin . $reference;

    $path = (string) parse_url($baseUrl, PHP_URL_PATH);
    if ($path === '' || $path === '/') {
        $directory = '/';
    } elseif (str_ends_with($path, '/')) {
        $directory = $path;
    } else {
        $lastSlash = strrpos($path, '/');
        $directory = $lastSlash === false ? '/' : substr($path, 0, $lastSlash + 1);
    }
    return $origin . $directory . $reference;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$url = trim((string) ($_GET['url'] ?? ''));
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid URL']);
    exit;
}

$scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
$host = strtolower((string) parse_url($url, PHP_URL_HOST));
$allowedHost = $host === 'localhost'
    || $host === '127.0.0.1'
    || $host === '::1'
    || str_ends_with($host, '.test')
    || str_ends_with($host, '.local')
    || !str_contains($host, '.');

if ($scheme !== 'http' || !$allowedHost) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Only local HTTP WAMP pages are allowed']);
    exit;
}

$pageResponse = fetchLocalResource($url);
$html = $pageResponse['status'] >= 200 && $pageResponse['status'] < 400
    ? $pageResponse['body']
    : '';

if ($html === '') {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Local page could not be read']);
    exit;
}

$iconHref = '';
if (preg_match_all('~<link\b[^>]*>~i', $html, $linkMatches)) {
    foreach ($linkMatches[0] as $linkTag) {
        if (!preg_match('~\brel\s*=\s*(["\'])(.*?)\1~i', $linkTag, $relMatch)) continue;
        if (!preg_match('~(?:^|\s)(?:shortcut\s+)?icon(?:\s|$)~i', trim($relMatch[2]))) continue;
        if (preg_match('~\bhref\s*=\s*(["\'])(.*?)\1~i', $linkTag, $hrefMatch)) {
            $iconHref = html_entity_decode(trim($hrefMatch[2]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            break;
        }
    }
}

if ($iconHref === '') {
    echo json_encode(['ok' => false, 'error' => 'No icon declaration found']);
    exit;
}

$iconUrl = resolveUrl($url, $iconHref);
$iconResponse = fetchLocalResource($iconUrl);
$iconBytes = $iconResponse['status'] >= 200 && $iconResponse['status'] < 400
    ? $iconResponse['body']
    : '';

if ($iconBytes === '') {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Declared icon could not be read']);
    exit;
}

$mimeType = strtolower(trim(explode(';', $iconResponse['contentType'])[0] ?? ''));
if (!str_starts_with($mimeType, 'image/')) {
    $extension = strtolower((string) pathinfo((string) parse_url($iconUrl, PHP_URL_PATH), PATHINFO_EXTENSION));
    $mimeType = match ($extension) {
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        default => 'image/x-icon',
    };
}

echo json_encode([
    'ok' => true,
    'iconData' => 'data:' . $mimeType . ';base64,' . base64_encode($iconBytes),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
