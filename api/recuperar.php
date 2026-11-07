<?php
/*
 * DOCUMENTACIÓN - api/recuperar.php   (POST  { email, dato, password })
 *
 * Restablece la contraseña de un cliente SIN enviar emails (el proyecto corre sin conexión).
 * Para comprobar que la cuenta es de quien lo pide, hay que dar el email y UN dato más que
 * solo el dueño debería saber: el DNI o el teléfono cargados en la cuenta.
 *
 * REGLAS
 *   - Se compara solo por dígitos (se ignoran espacios, guiones y puntos).
 *   - Un dato vacío en la cuenta nunca coincide (si no cargó DNI ni teléfono, no puede
 *     recuperar sola: un administrador le cambia la clave desde Usuarios).
 *   - Siempre se responde lo mismo si algo no coincide ("Los datos no coinciden"): no se
 *     revela si el email existe.
 *   - Tope de intentos fallidos por sesión (5 y se bloquea 5 minutos) y una pequeña demora
 *     en cada error, para frenar adivinar el DNI por fuerza bruta.
 *   - Las cuentas de administrador NO se pueden recuperar por acá (se evita que alguien
 *     tome el panel con un DNI): se cambian desde el panel o la base.
 *   - La nueva contraseña se guarda con password_hash(). No se inicia sesión sola: la persona
 *     entra después con su clave nueva.
 */
require_once __DIR__ . '/_comun.php';

$d = entrada();

$ahora = time();
if (($_SESSION['rec_bloqueo'] ?? 0) > $ahora) {
    fallar('Demasiados intentos. Probá de nuevo en unos minutos.', 429);
}

$email = strtolower(trim((string)($d['email'] ?? '')));
$dato  = preg_replace('/\D/', '', (string)($d['dato'] ?? ''));
$pass  = (string)($d['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar('El email no es válido.');
if ($dato === '')                                fallar('Ingresá tu DNI o tu teléfono.');
if (strlen($pass) < 4 || strlen($pass) > 200)    fallar('La contraseña nueva debe tener al menos 4 caracteres.');

$u = consultar(
    'SELECT id, dni, telefono, rol_id FROM usuarios WHERE email = :e AND activo = 1 LIMIT 1',
    [':e' => $email]
)[0] ?? null;

$ok = false;
if ($u && (int)$u['rol_id'] === ROL_CLIENTE) {
    $dni = preg_replace('/\D/', '', (string)$u['dni']);
    $tel = preg_replace('/\D/', '', (string)$u['telefono']);
    $ok = ($dni !== '' && hash_equals($dni, $dato)) || ($tel !== '' && hash_equals($tel, $dato));
}

if (!$ok) {
    $_SESSION['rec_fallos'] = ($_SESSION['rec_fallos'] ?? 0) + 1;
    if ($_SESSION['rec_fallos'] >= 5) {
        $_SESSION['rec_bloqueo'] = $ahora + 300;
        $_SESSION['rec_fallos'] = 0;
    }
    usleep(600000);
    fallar('Los datos no coinciden.', 400);
}

$_SESSION['rec_fallos'] = 0;
$conexion->prepare('UPDATE usuarios SET password = :p WHERE id = :id')
    ->execute([':p' => password_hash($pass, PASSWORD_DEFAULT), ':id' => $u['id']]);

responder(['ok' => true]);
