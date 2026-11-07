<?php
/*
 * DOCUMENTACIÓN - api/logout.php   (POST)
 * Cierra la sesión: borra los datos de la sesión PHP y la cookie.
 */
require_once __DIR__ . '/_comun.php';

entrada();

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

responder(['ok' => true]);
