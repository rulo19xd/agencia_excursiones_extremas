<?php
/*
 * DOCUMENTACIÓN - api/pedido.php   (POST)
 *
 * Crea un pedido completo: pedidos + pedido_items (+ pagos si corresponde).
 *
 *   { usuario_id, estado_id, items: [{ excursion_id, personas }], pago: { marca, ultimos4 } }
 *
 * REGLAS (todas se validan acá, nunca se confía en el navegador):
 *   - Hay que estar logueado. Un cliente solo puede crear pedidos a SU nombre; un
 *     administrador puede elegir el cliente (y queda registrado en creado_por).
 *   - Los precios y el total salen de la tabla excursiones, no de lo que mande la pantalla.
 *   - Se verifica que haya lugares. Todo ocurre en una transacción con las excursiones
 *     bloqueadas (FOR UPDATE): si dos personas compran el último lugar a la vez, solo
 *     una lo consigue.
 *   - pedidos.nombre guarda el código de reserva (VT-XXXXXX), que las pantallas llaman "codigo".
 *   - De la tarjeta solo se guardan la marca y los últimos 4 dígitos.
 *
 * Un administrador puede crear la reserva ya cobrada indicando el método (efectivo, transferencia...).
 *
 * NOTA: el cobro de la tarjeta sigue siendo simulado (checkout.js). Cuando se conecte una
 * pasarela real, este es el lugar donde habría que confirmar el pago antes de marcar PAGADA.
 */
require_once __DIR__ . '/_comun.php';

$yo = exigir_login();
$d = entrada();
$esAdmin = $yo['rol_id'] === ROL_ADMIN;

// ----- a nombre de quién -----
if ($esAdmin) {
    $usuarioId = (int)($d['usuario_id'] ?? 0);
    $destino = leer_fila('usuarios', $usuarioId);
    if (!$destino || !$destino['activo']) {
        throw new ErrorNegocio('El cliente elegido no existe o está inactivo.');
    }
    $creadoPor = $yo['id'];
} else {
    $usuarioId = $yo['id'];
    $creadoPor = null;
}

// ----- ítems (si repiten una excursión, se suman las personas) -----
$crudos = $d['items'] ?? null;
if (!is_array($crudos) || !$crudos) {
    throw new ErrorNegocio('El pedido no tiene excursiones.');
}
$items = [];
foreach ($crudos as $it) {
    $eid = is_array($it) ? (int)($it['excursion_id'] ?? 0) : 0;
    $per = is_array($it) ? (int)($it['personas'] ?? 0) : 0;
    if ($eid <= 0 || $per < 1 || $per > 50) {
        throw new ErrorNegocio('Cantidad de personas inválida (de 1 a 50).');
    }
    $items[$eid] = ($items[$eid] ?? 0) + $per;
}
ksort($items);   // siempre se bloquean en el mismo orden (evita bloqueos cruzados entre pedidos)

// ----- pago -----
$pago = null;
if (isset($d['pago']) && is_array($d['pago'])) {
    $ultimos = substr(preg_replace('/\D/', '', (string)($d['pago']['ultimos4'] ?? '')), -4);
    $marca = mb_substr(trim((string)($d['pago']['marca'] ?? '')), 0, 50);
    if ($esAdmin && strlen($ultimos) !== 4) {
        // el administrador registra un cobro manual (desde el panel): método de la lista, sin tarjeta
        if (!in_array($marca, METODOS_COBRO, true)) {
            throw new ErrorNegocio('Elegí un método de cobro válido.');
        }
        $ultimos = null;
    } elseif (strlen($ultimos) !== 4) {
        throw new ErrorNegocio('Los datos del pago no son válidos.');
    }
    $pago = ['marca' => $marca, 'ultimos4' => $ultimos];
}

// ----- estado inicial -----
$estado = (int)($d['estado_id'] ?? ESTADO_PENDIENTE);
if (!in_array($estado, [ESTADO_PENDIENTE, ESTADO_PAGADA], true)) {
    $estado = ESTADO_PENDIENTE;
}
if ($estado === ESTADO_PAGADA && !$pago) {
    $estado = ESTADO_PENDIENTE;           // "Pagada" siempre lleva un cobro registrado
}
if ($estado !== ESTADO_PAGADA) {
    $pago = null;
}

// ----- todo o nada -----
$conexion->beginTransaction();
try {
    $total = 0.0;
    $lineas = [];
    $hoy = date('Y-m-d');

    foreach ($items as $eid => $personas) {
        $st = $conexion->prepare(
            'SELECT id, nombre, precio, capacidad, activa, fecha_salida
               FROM excursiones WHERE id = :id FOR UPDATE'
        );
        $st->execute([':id' => $eid]);
        $ex = $st->fetch();

        if (!$ex || !(int)$ex['activa']) {
            throw new ErrorNegocio('La excursión ya no está disponible.', 409);
        }
        if (!$esAdmin && $ex['fecha_salida'] < $hoy) {
            throw new ErrorNegocio('La excursión "' . $ex['nombre'] . '" ya salió.', 409);
        }
        $libres = max(0, (int)$ex['capacidad'] - ocupados_de((int)$eid));
        if ($personas > $libres) {
            throw new ErrorNegocio('No quedan lugares suficientes en "' . $ex['nombre'] . '" (libres: ' . $libres . ').', 409);
        }
        $precio = (float)$ex['precio'];
        $total += $precio * $personas;
        $lineas[] = [(int)$eid, $personas, $precio];
    }
    $total = round($total, 2);

    // código de reserva único
    do {
        $codigo = 'VT-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    } while (valor('SELECT 1 FROM pedidos WHERE nombre = :c', [':c' => $codigo]) !== false);

    $ahora = date('Y-m-d H:i:s');
    $conexion->prepare(
        'INSERT INTO pedidos (nombre, usuario_id, creado_por, estado_id, total, creado_en)
         VALUES (:n, :u, :cp, :e, :t, :f)'
    )->execute([':n' => $codigo, ':u' => $usuarioId, ':cp' => $creadoPor, ':e' => $estado, ':t' => $total, ':f' => $ahora]);
    $pedidoId = (int)$conexion->lastInsertId();

    $insItem = $conexion->prepare(
        'INSERT INTO pedido_items (pedido_id, excursion_id, personas, precio_unitario) VALUES (:p, :e, :n, :pr)'
    );
    foreach ($lineas as $l) {
        $insItem->execute([':p' => $pedidoId, ':e' => $l[0], ':n' => $l[1], ':pr' => $l[2]]);
    }

    if ($pago) {
        $conexion->prepare(
            'INSERT INTO pagos (pedido_id, marca, ultimos4, monto, aprobado, motivo, creado_en)
             VALUES (:p, :m, :u, :mo, 1, NULL, :f)'
        )->execute([':p' => $pedidoId, ':m' => $pago['marca'], ':u' => $pago['ultimos4'], ':mo' => $total, ':f' => $ahora]);
    }

    $conexion->commit();
} catch (Throwable $e) {
    if ($conexion->inTransaction()) {
        $conexion->rollBack();
    }
    throw $e;
}

responder(['pedido' => leer_fila('pedidos', $pedidoId)], 201);
