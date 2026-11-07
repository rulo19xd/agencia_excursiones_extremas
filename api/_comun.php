<?php
/*
 * DOCUMENTACIÓN - api/_comun.php
 *
 * Lo comparten todos los archivos de la carpeta api/. Hace tres cosas:
 *   1. Conecta con la base (usa tu conexion.php de la raíz) y abre la sesión PHP.
 *   2. Ofrece funciones para responder JSON, leer lo que manda el navegador y
 *      exigir que haya un usuario logueado o un administrador.
 *   3. Convierte los valores que devuelve MySQL (todo texto) a números, para que
 *      js/datos.js reciba los mismos tipos que usaban las pantallas.
 *
 * Los archivos de api/ NUNCA se abren a mano en el navegador: los llama js/datos.js.
 */

// true = en pantalla se ve el detalle técnico de los errores (útil mientras desarrollás).
// Ponelo en false cuando publiques el sitio.
const VERTIGO_DEBUG = true;

ob_start();                       // por si algún archivo incluido imprime espacios sueltos
ini_set('display_errors', '0');   // los avisos de PHP rompen el JSON: se guardan en el log
error_reporting(E_ALL);

const ROL_ADMIN = 1;
const ROL_CLIENTE = 2;
const ESTADO_PENDIENTE = 1;
const ESTADO_PAGADA = 2;
const ESTADO_CANCELADA = 3;

// Error "esperable" (validación, sin lugares, etc.): se muestra tal cual al usuario.
class ErrorNegocio extends Exception
{
    public function __construct(string $mensaje, int $codigo = 400)
    {
        parent::__construct($mensaje, $codigo);
    }
}

function responder($datos, int $codigo = 200): void
{
    if (ob_get_length()) {
        ob_clean();
    }
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

function fallar(string $mensaje, int $codigo = 400): void
{
    responder(['error' => $mensaje], $codigo);
}

set_exception_handler(function (Throwable $e) {
    error_log('[vertigo] ' . $e);
    if ($e instanceof ErrorNegocio) {
        fallar($e->getMessage(), $e->getCode() ?: 400);
    }
    fallar(VERTIGO_DEBUG ? 'Error del servidor: ' . $e->getMessage() : 'Error interno del servidor.', 500);
});

// ---------- conexión (tu archivo conexion.php define $conexion como PDO) ----------
require_once __DIR__ . '/../conexion.php';
date_default_timezone_set('America/Argentina/San_Juan');
$conexion->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

// ---------- sesión ----------
session_name('vertigo_sid');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => !empty($_SERVER['HTTPS']),
    'httponly' => true,       // JavaScript no puede leer la cookie de sesión
    'samesite' => 'Lax',
]);
session_start();

// ---------- entrada ----------
// Las escrituras llegan siempre por POST con JSON. Exigir "application/json" también
// frena los formularios de otros sitios (un <form> externo no puede mandar ese tipo).
function entrada(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fallar('Método no permitido.', 405);
    }
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        fallar('Tipo de contenido no permitido.', 415);
    }
    $datos = json_decode(file_get_contents('php://input'), true);
    if (!is_array($datos)) {
        fallar('Los datos enviados no son válidos.', 400);
    }
    return $datos;
}

// ---------- base de datos ----------
function consultar(string $sql, array $params = []): array
{
    global $conexion;
    $st = $conexion->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

function valor(string $sql, array $params = [])
{
    global $conexion;
    $st = $conexion->prepare($sql);
    $st->execute($params);
    return $st->fetchColumn();
}

// Qué columnas son enteros, decimales o fechas de cada tabla (para convertir los tipos).
function esquema_tipos(): array
{
    return [
        'roles'           => ['i' => ['id']],
        'estados_pedido'  => ['i' => ['id']],
        'tipos_excursion' => ['i' => ['id']],
        'paises'          => ['i' => ['id']],
        'provincias'      => ['i' => ['id', 'pais_id']],
        'ciudades'        => ['i' => ['id', 'provincia_id']],
        'excursiones'     => ['i' => ['id', 'tipo_excursion_id', 'ciudad_id', 'capacidad', 'activa'], 'f' => ['precio']],
        'usuarios'        => ['i' => ['id', 'ciudad_id', 'rol_id', 'activo']],
        'pedidos'         => ['i' => ['id', 'usuario_id', 'creado_por', 'estado_id'], 'f' => ['total'], 'd' => ['creado_en']],
        'pedido_items'    => ['i' => ['id', 'pedido_id', 'excursion_id', 'personas'], 'f' => ['precio_unitario']],
        'pagos'           => ['i' => ['id', 'pedido_id', 'aprobado'], 'f' => ['monto'], 'd' => ['creado_en']],
    ];
}

function tipar(string $tabla, array $fila): array
{
    $e = esquema_tipos()[$tabla] ?? [];
    foreach ($e['i'] ?? [] as $c) {
        if (array_key_exists($c, $fila) && $fila[$c] !== null) {
            $fila[$c] = (int)$fila[$c];
        }
    }
    foreach ($e['f'] ?? [] as $c) {
        if (array_key_exists($c, $fila) && $fila[$c] !== null) {
            $fila[$c] = (float)$fila[$c];
        }
    }
    foreach ($e['d'] ?? [] as $c) {
        if (!empty($fila[$c])) {
            $fila[$c] = str_replace(' ', 'T', $fila[$c]);   // "2026-11-03 18:55:07" -> ISO
        }
    }
    if (isset($fila['nombre'])) {
        $fila['nombre'] = trim($fila['nombre']);
    }
    if ($tabla === 'excursiones') {
        $fila['descripcion'] = $fila['descripcion'] ?? '';
        $fila['imagen'] = $fila['imagen'] ?? '';
    }
    return $fila;
}

function tipar_lista(string $tabla, array $filas): array
{
    return array_map(function ($f) use ($tabla) {
        return tipar($tabla, $f);
    }, $filas);
}

// Una fila lista para mandar al navegador (sin contraseña; pedidos.nombre se muestra como "codigo").
function leer_fila(string $tabla, int $id): ?array
{
    if (!isset(esquema_tipos()[$tabla])) {
        throw new LogicException('Tabla desconocida: ' . $tabla);
    }
    if ($tabla === 'usuarios') {
        $cols = 'id, nombre, apellido, email, telefono, dni, ciudad_id, rol_id, activo';
    } elseif ($tabla === 'pedidos') {
        $cols = 'id, nombre AS codigo, usuario_id, creado_por, estado_id, total, creado_en';
    } else {
        $cols = '*';
    }
    $f = consultar("SELECT $cols FROM `$tabla` WHERE id = :id", [':id' => $id])[0] ?? null;
    return $f ? tipar($tabla, $f) : null;
}

// La fila tal cual está en la base (incluye password): solo para uso interno del servidor.
function leer_cruda(string $tabla, int $id): ?array
{
    if (!isset(esquema_tipos()[$tabla])) {
        throw new LogicException('Tabla desconocida: ' . $tabla);
    }
    return consultar("SELECT * FROM `$tabla` WHERE id = :id", [':id' => $id])[0] ?? null;
}

function existe(string $tabla, int $id): bool
{
    if (!isset(esquema_tipos()[$tabla])) {
        throw new LogicException('Tabla desconocida: ' . $tabla);
    }
    return $id > 0 && valor("SELECT 1 FROM `$tabla` WHERE id = :id", [':id' => $id]) !== false;
}

// Lugares ocupados = personas en pedidos que no están cancelados.
function ocupados_de(int $excursionId): int
{
    return (int)valor(
        'SELECT COALESCE(SUM(pi.personas), 0)
           FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
          WHERE pi.excursion_id = :e AND p.estado_id <> :c',
        [':e' => $excursionId, ':c' => ESTADO_CANCELADA]
    );
}

// ---------- usuario logueado ----------
// Se vuelve a leer de la base en cada pedido: si un administrador desactiva o cambia de
// rol a alguien, el cambio vale de inmediato (no queda "pegado" en la sesión).
function usuario_actual(): ?array
{
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id <= 0) {
        return null;
    }
    $f = consultar(
        'SELECT id, nombre, apellido, email, telefono, dni, ciudad_id, rol_id, activo
           FROM usuarios WHERE id = :id AND activo = 1',
        [':id' => $id]
    )[0] ?? null;
    if (!$f) {
        unset($_SESSION['uid']);
        return null;
    }
    return tipar('usuarios', $f);
}

function exigir_login(): array
{
    $u = usuario_actual();
    if (!$u) {
        fallar('Tenés que iniciar sesión.', 401);
    }
    return $u;
}

function exigir_admin(): array
{
    $u = exigir_login();
    if ($u['rol_id'] !== ROL_ADMIN) {
        fallar('No tenés permiso para hacer esto.', 403);
    }
    return $u;
}

// ---------- cobros y reembolsos ----------
// Cuántos días antes de la salida puede un CLIENTE cancelar su reserva (1 = hasta el día anterior).
const DIAS_MINIMOS_PARA_CANCELAR = 1;

// Métodos de cobro que un administrador puede registrar a mano.
const METODOS_COBRO = ['Efectivo', 'Transferencia', 'Tarjeta (posnet)', 'Otro'];

// Lo cobrado de un pedido = suma de sus pagos aprobados. Los reembolsos se guardan como
// pagos con monto NEGATIVO, así que la suma ya los descuenta.
function cobrado_de(int $pedidoId): float
{
    return round((float)valor(
        'SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE pedido_id = :p AND aprobado = 1',
        [':p' => $pedidoId]
    ), 2);
}

// Si el pedido tiene dinero cobrado, registra el reembolso (un pago negativo por el neto).
// Devuelve el monto reembolsado (0 si no había nada cobrado). Es seguro llamarla dos veces:
// la segunda encuentra neto 0 y no hace nada.
function reembolsar_pedido(int $pedidoId): float
{
    global $conexion;
    $neto = cobrado_de($pedidoId);
    if ($neto <= 0) {
        return 0.0;
    }
    $conexion->prepare(
        'INSERT INTO pagos (pedido_id, marca, ultimos4, monto, aprobado, motivo, creado_en)
         VALUES (:p, :m, NULL, :mo, 1, :mt, :f)'
    )->execute([
        ':p' => $pedidoId, ':m' => 'Reembolso', ':mo' => -$neto,
        ':mt' => 'Reembolso por cancelación', ':f' => date('Y-m-d H:i:s'),
    ]);
    return $neto;
}
