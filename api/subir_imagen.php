<?php
/*
 * DOCUMENTACIÓN - api/subir_imagen.php   (POST multipart/form-data, campo "imagen", solo administradores)
 *
 * Guarda la foto DENTRO DE LA BASE DE DATOS (tabla `imagenes`, columna `datos` MEDIUMBLOB) y devuelve
 * { id, nombre, tamano }. Ese id se guarda en excursiones.imagen_id (lo hace el panel al guardar la
 * excursión) y la foto se ve en  api/imagen.php?id=ID.
 *
 * SEGURIDAD
 *   - Solo administradores.
 *   - El tipo se verifica mirando el CONTENIDO del archivo (getimagesize), no su nombre ni lo que
 *     declare el navegador. Solo JPG, PNG, WEBP y GIF. El nombre original solo se guarda como dato
 *     informativo (limpiado): nunca se usa para armar rutas.
 *   - Máximo 5 MB de subida.
 *
 * OPTIMIZACIÓN (si PHP tiene GD, que XAMPP trae activado)
 *   Se guarda UNA sola foto en buena calidad: las grandes se achican a un ancho máximo de 2000 px
 *   (y, si hace falta, 1600 o 1280 px con algo menos de calidad) hasta pesar como máximo 3 MB.
 *   Las versiones livianas para las pantallas de listado (400, 800 y 1280 px de ancho) las genera
 *   api/imagen.php cuando se piden (?w=400) y las guarda en la tabla `imagenes_variantes`.
 *   Para guardar fotos de hasta 3 MB, max_allowed_packet de MySQL tiene que ser de al menos 8M
 *   (README: "Imágenes dentro de la base de datos").
 *
 * LIMPIEZA: las imágenes subidas que nunca se asignaron a una excursión (más de 1 día) se borran solas.
 */
require_once __DIR__ . '/_comun.php';

const IMAGEN_MAX_SUBIDA = 5 * 1024 * 1024;
const IMAGEN_MAX_GUARDADA = 3 * 1024 * 1024;   // la foto original se guarda en buena calidad; imagen.php genera las versiones chicas
const IMAGEN_ANCHO_MAX = 2000;

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
    UPLOAD_ERR_CANT_WRITE => 'El servidor no pudo leer la imagen.',
    UPLOAD_ERR_EXTENSION  => 'Una extensión de PHP frenó la subida.',
];
if ($f['error'] !== UPLOAD_ERR_OK) {
    fallar($errores[$f['error']] ?? 'No se pudo subir la imagen.');
}
if ($f['size'] > IMAGEN_MAX_SUBIDA) {
    fallar('La imagen no puede pesar más de 5 MB.');
}

$info = @getimagesize($f['tmp_name']);
$mimes = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_GIF => 'image/gif'];
if (defined('IMAGETYPE_WEBP')) {
    $mimes[IMAGETYPE_WEBP] = 'image/webp';
}
if (!$info || !isset($mimes[$info[2]])) {
    fallar('El archivo no es una imagen válida (usá JPG, PNG, WEBP o GIF).');
}
$tipo = $info[2];
$mime = $mimes[$tipo];

$bin = file_get_contents($f['tmp_name']);
if ($bin === false || $bin === '') {
    fallar('No se pudo leer la imagen.');
}

/**
 * Achica la imagen (si hace falta y se puede) hasta que pese <= IMAGEN_MAX_GUARDADA.
 * Devuelve el contenido final o null si no se logró (por ejemplo un GIF muy pesado).
 */
function optimizar_imagen(string $bin, int $tipo, int $ancho): ?string
{
    $limite = IMAGEN_MAX_GUARDADA;
    if ($tipo === IMAGETYPE_GIF || !function_exists('imagecreatefromstring')) {
        return strlen($bin) <= $limite ? $bin : null;      // GIF animado: no se toca
    }
    if (strlen($bin) <= $limite && $ancho <= IMAGEN_ANCHO_MAX) {
        return $bin;                                        // ya está bien: no se recomprime
    }
    $origen = @imagecreatefromstring($bin);
    if (!$origen) {
        return strlen($bin) <= $limite ? $bin : null;
    }
    $w = imagesx($origen);
    $h = imagesy($origen);
    $mejor = null;
    foreach ([[IMAGEN_ANCHO_MAX, 88], [1600, 82], [1280, 76]] as [$maxAncho, $calidad]) {
        $nw = min($w, $maxAncho);
        $nh = (int)round($h * $nw / $w);
        $dst = imagecreatetruecolor($nw, $nh);
        if ($tipo !== IMAGETYPE_JPEG) {                     // conservar la transparencia
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        }
        imagecopyresampled($dst, $origen, 0, 0, 0, 0, $nw, $nh, $w, $h);
        ob_start();
        if ($tipo === IMAGETYPE_PNG) {
            imagepng($dst, null, 7);
        } elseif ($tipo === IMAGETYPE_WEBP && function_exists('imagewebp')) {
            imagewebp($dst, null, $calidad);
        } else {
            imagejpeg($dst, null, $calidad);
        }
        $out = (string)ob_get_clean();
        $mejor = $out !== '' ? $out : $mejor;
        if ($out !== '' && strlen($out) <= $limite) {
            return $out;
        }
    }
    return null;
}

$final = optimizar_imagen($bin, $tipo, (int)$info[0]);
if ($final === null) {
    fallar('La imagen pesa demasiado (más de 3 MB aun achicándola). Probá con una más liviana o en formato JPG.');
}
$tamano = strlen($final);

// nombre original: solo informativo
$nombre = trim(preg_replace('/[^\p{L}\p{N} ._-]+/u', '', basename((string)$f['name'])));
$nombre = mb_substr($nombre === '' ? 'imagen' : $nombre, 0, 200);

try {
    // limpieza de imágenes que quedaron sin usar hace más de un día
    $conexion->prepare(
        'DELETE FROM imagenes WHERE creado_en < :limite
            AND id NOT IN (SELECT imagen_id FROM excursiones WHERE imagen_id IS NOT NULL)'
    )->execute([':limite' => date('Y-m-d H:i:s', time() - 86400)]);

    $st = $conexion->prepare(
        'INSERT INTO imagenes (nombre, tipo_mime, tamano, datos, creado_en) VALUES (:n, :m, :t, :d, :c)'
    );
    $st->bindValue(':n', $nombre);
    $st->bindValue(':m', $mime);
    $st->bindValue(':t', $tamano, PDO::PARAM_INT);
    $st->bindParam(':d', $final, PDO::PARAM_LOB);
    $st->bindValue(':c', date('Y-m-d H:i:s'));
    $st->execute();
} catch (PDOException $e) {
    $c = (int)($e->errorInfo[1] ?? 0);
    if ($c === 1153 || $c === 2006) {
        fallar('La base rechazó la imagen por su tamaño. Aumentá max_allowed_packet en el my.ini de MySQL (por ejemplo 16M) o subí una imagen más liviana.', 413);
    }
    throw $e;
}

responder(['id' => (int)$conexion->lastInsertId(), 'nombre' => $nombre, 'tamano' => $tamano], 201);
