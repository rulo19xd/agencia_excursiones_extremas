<?php
/*
 * DOCUMENTACIÓN - api/login.php   (POST  { email, password })
 *
 * Valida el email y la contraseña contra la tabla usuarios. Si son correctos, guarda el
 * id del usuario en la sesión PHP (cookie) y devuelve { usuario }.
 *
 * CONTRASEÑAS: se guardan con password_hash() (bcrypt). Las cuentas viejas que todavía
 * tienen la contraseña en texto plano (por ejemplo "1234") se aceptan UNA vez y en ese
 * mismo momento se convierten a hash, así no hay que migrarlas a mano.
 */
require_once __DIR__ . '/_comun.php';

$d = entrada();
$email = strtolower(trim((string)($d['email'] ?? '')));
$pass  = (string)($d['password'] ?? '');

$fila = null;
if ($email !== '' && $pass !== '') {
    $fila = consultar(
        'SELECT id, password FROM usuarios WHERE email = :e AND activo = 1 LIMIT 1',
        [':e' => $email]
    )[0] ?? null;
}

$ok = false;
if ($fila) {
    $guardada = (string)$fila['password'];
    $esHash = !empty(password_get_info($guardada)['algo']);

    if ($esHash) {
        $ok = password_verify($pass, $guardada);
        if ($ok && password_needs_rehash($guardada, PASSWORD_DEFAULT)) {
            $conexion->prepare('UPDATE usuarios SET password = :p WHERE id = :id')
                ->execute([':p' => password_hash($pass, PASSWORD_DEFAULT), ':id' => $fila['id']]);
        }
    } elseif (hash_equals($guardada, $pass)) {
        // cuenta vieja con contraseña en texto plano: se acepta y se convierte a hash
        $ok = true;
        $conexion->prepare('UPDATE usuarios SET password = :p WHERE id = :id')
            ->execute([':p' => password_hash($pass, PASSWORD_DEFAULT), ':id' => $fila['id']]);
    }
}

if (!$ok) {
    usleep(400000);   // frena un poco los intentos de adivinar contraseñas
    fallar('Email o contraseña incorrectos.', 401);
}

session_regenerate_id(true);          // sesión nueva al ingresar (evita fijación de sesión)
$_SESSION['uid'] = (int)$fila['id'];

responder(['usuario' => usuario_actual()]);
