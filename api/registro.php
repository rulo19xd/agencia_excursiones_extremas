<?php
/*
 * DOCUMENTACIÓN - api/registro.php   (POST  { nombre, apellido, email, password, telefono, dni })
 *
 * Crea una cuenta de CLIENTE. El rol lo decide el servidor (siempre cliente): aunque
 * alguien manipule lo que envía el navegador, desde acá no se puede crear un
 * administrador. Los administradores se crean desde el panel.
 */
require_once __DIR__ . '/_comun.php';

$d = entrada();

$nombre   = trim((string)($d['nombre'] ?? ''));
$apellido = trim((string)($d['apellido'] ?? ''));
$email    = strtolower(trim((string)($d['email'] ?? '')));
$pass     = (string)($d['password'] ?? '');
$telefono = trim((string)($d['telefono'] ?? ''));
$dni      = preg_replace('/\D/', '', (string)($d['dni'] ?? ''));

if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100)     fallar('Ingresá tu nombre.');
if (mb_strlen($apellido) < 2 || mb_strlen($apellido) > 100) fallar('Ingresá tu apellido.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) fallar('El email no es válido.');
if (strlen($pass) < 4 || strlen($pass) > 200)               fallar('La contraseña debe tener al menos 4 caracteres.');
if ($dni !== '' && (strlen($dni) < 7 || strlen($dni) > 8))  fallar('El DNI debe tener 7 u 8 números.');
if (mb_strlen($telefono) > 50)                              fallar('El teléfono es demasiado largo.');

if (valor('SELECT 1 FROM usuarios WHERE email = :e', [':e' => $email]) !== false) {
    fallar('Ya existe una cuenta con ese email.', 409);
}

try {
    $conexion->prepare(
        'INSERT INTO usuarios (nombre, apellido, email, password, telefono, dni, ciudad_id, rol_id, activo)
         VALUES (:n, :a, :e, :p, :t, :d, NULL, :r, 1)'
    )->execute([
        ':n' => $nombre, ':a' => $apellido, ':e' => $email,
        ':p' => password_hash($pass, PASSWORD_DEFAULT),
        ':t' => $telefono, ':d' => $dni, ':r' => ROL_CLIENTE,
    ]);
} catch (PDOException $e) {
    if ((int)($e->errorInfo[1] ?? 0) === 1062) {   // índice único del email (ver sql/etapa_b.sql)
        fallar('Ya existe una cuenta con ese email.', 409);
    }
    throw $e;
}

responder(['usuario' => leer_fila('usuarios', (int)$conexion->lastInsertId())], 201);
