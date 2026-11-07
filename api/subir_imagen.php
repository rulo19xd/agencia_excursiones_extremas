<?php
/*
 * DOCUMENTACIÓN - api/subir_imagen.php   (POST multipart/form-data, campo "imagen", solo administradores)
 *
 * Guarda una foto en la carpeta images/excursiones/ del sitio y devuelve su ruta
 * ({ ruta: "images/excursiones/..." }), lista para usar en el campo "imagen" de una excursión.
 *
 * SEGURIDAD
 *   - Solo administradores.
 *   - El tipo se verifica mirando el CONTENIDO del archivo (getimagesize), no su nombre ni lo
 *     que declare el navegador. Solo JPG, PNG, WEBP y GIF.
 *   - Máximo 5 MB.
 *   - El nombre final lo genera el servidor (aleatorio + extensión según el tipo real): el
 *     nombre original nunca se usa, así no se puede subir un .php disfrazado.
 *   - La carpeta se crea si no existe.
 *
 * Si falla con "tamaño", revisá upload_max_filesize y post_max_size en php.ini (XAMPP).
 */
require_once __DIR__ . '/_comun.php';

exigir_admin();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fallar('Método no permitido.', 405);
}
if (empty($_FILES['imagen']) || !is_array($_FILES['imagen'])) {
    fallar('No se recibió ninguna imagen (puede superar el tamaño máximo que permite el servidor).');
}

$f = $_FILES['imagen'];
$errores = [
    UPLOAD_ERR_INI_SIZE   => 'La imagen supera el tamaño máximo que permite el servidor.',
    UPLOAD_ERR_FORM_SIZE  => 'La imagen es demasiado grande.',
    UPLOAD_ERR_PARTIAL    => 'La imagen se subió incompleta. Probá de nuevo.',
    UPLOAD_ERR_NO_FILE    => 'Elegí una imagen.',
    UPLOAD_ERR_NO_TMP_DIR => 'El servidor no tiene carpeta temporal.',
    UPLOAD_ERR_CANT_WRITE => 'El servidor no pudo guardar la imagen.',
    UPLOAD_ERR_EXTENSION  => 'Una extensión de PHP frenó la subida.',
];
if ($f['error'] !== UPLOAD_ERR_OK) {
    fallar($errores[$f['error']] ?? 'No se pudo subir la imagen.');
}
if ($f['size'] > 5 * 1024 * 1024) {
    fallar('La imagen no puede pesar más de 5 MB.');
}

$info = @getimagesize($f['tmp_name']);
$tipos = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif'];
if (defined('IMAGETYPE_WEBP')) {
    $tipos[IMAGETYPE_WEBP] = 'webp';
}
if (!$info || !isset($tipos[$info[2]])) {
    fallar('El archivo no es una imagen válida (usá JPG, PNG, WEBP o GIF).');
}

$carpeta = __DIR__ . '/../images/excursiones';
if (!is_dir($carpeta) && !@mkdir($carpeta, 0755, true) && !is_dir($carpeta)) {
    throw new RuntimeException('No se pudo crear la carpeta images/excursiones.');
}

$nombre = 'exc_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $tipos[$info[2]];
if (!move_uploaded_file($f['tmp_name'], $carpeta . '/' . $nombre)) {
    throw new RuntimeException('No se pudo guardar la imagen en images/excursiones.');
}

responder(['ruta' => 'images/excursiones/' . $nombre], 201);
