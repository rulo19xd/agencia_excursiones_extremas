<?php
/*
 * DOCUMENTACIÓN - api/imagen.php   (GET  imagen.php?id=NÚMERO[&w=ANCHO])   PÚBLICO
 *
 * Devuelve la foto guardada en la tabla `imagenes` (columna `datos`, MEDIUMBLOB), lista para usar
 * en <img src="..."> o en un background-image.
 *
 * UNA SOLA FOTO, VARIAS MEDIDAS
 *   Se sube una única foto en buena calidad. Con el parámetro w se pide una versión más liviana:
 *       imagen.php?id=7&w=400    miniatura para las tarjetas (≈ 30-100 KB)
 *       imagen.php?id=7&w=800    tamaño intermedio
 *       imagen.php?id=7&w=1280   pantalla de detalle / portada
 *       imagen.php?id=7          la foto original, sin tocar
 *   Anchos permitidos: ver ANCHOS_PERMITIDOS (cualquier otro valor devuelve la original; así nadie
 *   puede llenar la base pidiendo medidas raras). La versión se genera la PRIMERA vez que alguien la
 *   pide (con la extensión GD de PHP) y queda guardada en la tabla `imagenes_variantes`: las
 *   siguientes veces sale directo de ahí. Nunca se agranda una foto: si la original es más chica
 *   que el ancho pedido, se devuelve la original.
 *
 *  - No usa sesión ni _comun.php a propósito: así el navegador puede guardar la imagen en caché
 *    (si arrancara la sesión, PHP agregaría cabeceras "no-cache").
 *  - Una imagen nunca se modifica: si el administrador cambia la foto de una excursión se crea una
 *    fila nueva con otro id. Por eso el navegador la cachea (1 día) y revalida con ETag
 *    (si no cambió, responde 304 sin volver a mandar los bytes).
 *  - Al borrarse la imagen original se borran solas sus variantes (clave foránea ON DELETE CASCADE).
 */
require_once __DIR__ . '/../conexion.php';

const ANCHOS_PERMITIDOS = [400, 800, 1280];
const CALIDAD_VARIANTE = 78;

/**
 * Crea una versión de ancho $w. Devuelve [mime, bytes] o null si no hace falta / no se puede
 * (sin GD, imagen ya más chica que $w, archivo ilegible): en ese caso se sirve la original.
 */
function crear_variante(string $bin, int $w): ?array
{
    if (!function_exists('imagecreatefromstring') || !function_exists('getimagesizefromstring')) {
        return null;
    }
    $info = @getimagesizefromstring($bin);
    if (!$info || $info[0] <= $w) {
        return null;
    }
    $origen = @imagecreatefromstring($bin);
    if (!$origen) {
        return null;
    }
    $h = max(1, (int)round($info[1] * $w / $info[0]));
    $dst = imagecreatetruecolor($w, $h);

    // PNG con transparencia -> se queda PNG; todo lo demás -> JPEG progresivo sobre fondo blanco
    $png = $info[2] === IMAGETYPE_PNG;
    $conAlfa = $png && (in_array(ord($bin[25] ?? "\0"), [4, 6], true) || strpos($bin, 'tRNS') !== false);
    if ($conAlfa) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    } else {
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
    }
    imagecopyresampled($dst, $origen, 0, 0, 0, 0, $w, $h, $info[0], $info[1]);

    ob_start();
    if ($conAlfa) {
        imagepng($dst, null, 7);
        $mime = 'image/png';
    } else {
        imageinterlace($dst, true);
        imagejpeg($dst, null, CALIDAD_VARIANTE);
        $mime = 'image/jpeg';
    }
    $out = (string)ob_get_clean();
    return $out === '' ? null : [$mime, $out];
}

$id = (int)($_GET['id'] ?? 0);
$w = (int)($_GET['w'] ?? 0);
if (!in_array($w, ANCHOS_PERMITIDOS, true)) {
    $w = 0;
}
if ($id <= 0) {
    http_response_code(404);
    exit;
}

$st = $conexion->prepare('SELECT tipo_mime, tamano, creado_en FROM imagenes WHERE id = :id');
$st->execute([':id' => $id]);
$meta = $st->fetch(PDO::FETCH_ASSOC);
if (!$meta) {
    http_response_code(404);
    exit;
}

$etag = '"img-' . $id . '-' . (int)$meta['tamano'] . '-' . strtotime((string)$meta['creado_en']) . ($w ? '-w' . $w : '') . '"';
header('ETag: ' . $etag);
header('Cache-Control: public, max-age=86400');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}

function leer_blob($v): string
{
    if (is_resource($v)) {
        $v = stream_get_contents($v);
    }
    return ($v === false || $v === null) ? '' : (string)$v;
}

$mime = $meta['tipo_mime'];
$datos = '';

if ($w) {
    // ¿ya está generada esta medida?
    $st = $conexion->prepare('SELECT tipo_mime, datos FROM imagenes_variantes WHERE imagen_id = :i AND ancho = :a');
    $st->execute([':i' => $id, ':a' => $w]);
    $v = $st->fetch(PDO::FETCH_ASSOC);
    if ($v) {
        $mime = $v['tipo_mime'];
        $datos = leer_blob($v['datos']);
    }
}

if ($datos === '') {
    $st = $conexion->prepare('SELECT datos FROM imagenes WHERE id = :id');
    $st->execute([':id' => $id]);
    $datos = leer_blob($st->fetchColumn());
    if ($datos === '') {
        http_response_code(404);
        exit;
    }
    if ($w) {
        $nueva = crear_variante($datos, $w);
        if ($nueva) {
            [$mime, $datos] = $nueva;
            try {
                $ins = $conexion->prepare(
                    'INSERT INTO imagenes_variantes (imagen_id, ancho, tipo_mime, datos, creado_en) VALUES (:i, :a, :m, :d, :c)'
                );
                $ins->bindValue(':i', $id, PDO::PARAM_INT);
                $ins->bindValue(':a', $w, PDO::PARAM_INT);
                $ins->bindValue(':m', $mime);
                $ins->bindParam(':d', $datos, PDO::PARAM_LOB);
                $ins->bindValue(':c', date('Y-m-d H:i:s'));
                $ins->execute();
            } catch (PDOException $e) {
                // otra visita la generó al mismo tiempo, o la tabla no existe todavía: se sirve igual
            }
        }
    }
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . strlen($datos));
echo $datos;
