<?php
/*
 * DOCUMENTACIÓN - api/snapshot.php   (GET)
 *
 * Devuelve de una sola vez todas las tablas que js/datos.js necesita para dibujar la
 * pantalla, según quién esté mirando:
 *
 *   visitante     catálogos + excursiones activas
 *   cliente       lo anterior + SU usuario, SUS pedidos, ítems y pagos
 *   administrador todo (usuarios, pedidos, ítems y pagos de todos)
 *
 * La contraseña de los usuarios no sale NUNCA de acá. Tampoco salen los pedidos ni los
 * pagos de otros clientes: el filtro se hace en el servidor, no en el navegador.
 */
require_once __DIR__ . '/_comun.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    fallar('Método no permitido.', 405);
}

$u = usuario_actual();
$esAdmin = $u !== null && $u['rol_id'] === ROL_ADMIN;
$uid = $u['id'] ?? 0;

$db = [];

// ----- catálogos (públicos) -----
$db['roles']           = tipar_lista('roles', consultar('SELECT id, nombre FROM roles ORDER BY id'));
$db['estados_pedido']  = tipar_lista('estados_pedido', consultar('SELECT id, nombre FROM estados_pedido ORDER BY id'));
$db['tipos_excursion'] = tipar_lista('tipos_excursion', consultar('SELECT id, nombre FROM tipos_excursion ORDER BY id'));
$db['paises']          = tipar_lista('paises', consultar('SELECT id, nombre FROM paises ORDER BY id'));
$db['provincias']      = tipar_lista('provincias', consultar('SELECT id, nombre, pais_id FROM provincias ORDER BY id'));
$db['ciudades']        = tipar_lista('ciudades', consultar('SELECT id, nombre, provincia_id FROM ciudades ORDER BY id'));

// ----- excursiones -----
$colsEx = 'id, nombre, descripcion, tipo_excursion_id, ciudad_id, precio, capacidad, fecha_salida, imagen, activa';
if ($esAdmin) {
    $filas = consultar("SELECT $colsEx FROM excursiones ORDER BY id");
} else {
    // activas + las que el cliente ya reservó (para que "Mis reservas" pueda mostrarlas
    // aunque después se hayan dado de baja)
    $filas = consultar(
        "SELECT $colsEx FROM excursiones
          WHERE activa = 1
             OR id IN (SELECT pi.excursion_id FROM pedido_items pi
                         JOIN pedidos p ON p.id = pi.pedido_id
                        WHERE p.usuario_id = :uid)
          ORDER BY id",
        [':uid' => $uid]
    );
}
$db['excursiones'] = tipar_lista('excursiones', $filas);

// ----- lugares ocupados por excursión (solo cantidades, no datos de nadie) -----
$ocupados = [];
$filas = consultar(
    'SELECT pi.excursion_id, SUM(pi.personas) AS n
       FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.estado_id <> :c
      GROUP BY pi.excursion_id',
    [':c' => ESTADO_CANCELADA]
);
foreach ($filas as $f) {
    $ocupados[(string)$f['excursion_id']] = (int)$f['n'];
}

// ----- datos privados -----
$colsPedido = 'p.id, p.nombre AS codigo, p.usuario_id, p.creado_por, p.estado_id, p.total, p.creado_en';
$colsItem   = 'pi.id, pi.pedido_id, pi.excursion_id, pi.personas, pi.precio_unitario';
$colsPago   = 'g.id, g.pedido_id, g.marca, g.ultimos4, g.monto, g.aprobado, g.motivo, g.creado_en';
$colsUsuario = 'id, nombre, apellido, email, telefono, dni, ciudad_id, rol_id, activo';

if ($esAdmin) {
    $usuarios = consultar("SELECT $colsUsuario FROM usuarios ORDER BY id");
    $pedidos  = consultar("SELECT $colsPedido FROM pedidos p ORDER BY p.id");
    $items    = consultar("SELECT $colsItem FROM pedido_items pi ORDER BY pi.id");
    $pagos    = consultar("SELECT $colsPago FROM pagos g ORDER BY g.id");
} elseif ($u !== null) {
    $usuarios = consultar("SELECT $colsUsuario FROM usuarios WHERE id = :uid", [':uid' => $uid]);
    $pedidos  = consultar("SELECT $colsPedido FROM pedidos p WHERE p.usuario_id = :uid ORDER BY p.id", [':uid' => $uid]);
    $items    = consultar(
        "SELECT $colsItem FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
          WHERE p.usuario_id = :uid ORDER BY pi.id",
        [':uid' => $uid]
    );
    $pagos    = consultar(
        "SELECT $colsPago FROM pagos g JOIN pedidos p ON p.id = g.pedido_id
          WHERE p.usuario_id = :uid ORDER BY g.id",
        [':uid' => $uid]
    );
} else {
    $usuarios = $pedidos = $items = $pagos = [];
}

$db['usuarios']     = tipar_lista('usuarios', $usuarios);
$db['pedidos']      = tipar_lista('pedidos', $pedidos);
$db['pedido_items'] = tipar_lista('pedido_items', $items);
$db['pagos']        = tipar_lista('pagos', $pagos);

responder([
    'sesion'   => $u,
    'db'       => $db,
    'ocupados' => (object)$ocupados,
]);
