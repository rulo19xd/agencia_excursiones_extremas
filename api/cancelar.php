<?php
/*
 * DOCUMENTACIÓN - api/cancelar.php   (POST  { pedido_id })
 *
 * Cancela una reserva y libera sus lugares.
 *
 * REGLAS
 *   - Hay que estar logueado. Un cliente solo puede cancelar SUS reservas; un administrador,
 *     cualquiera.
 *   - Un cliente solo puede cancelar si TODAS las excursiones de la reserva salen con al
 *     menos DIAS_MINIMOS_PARA_CANCELAR día(s) de anticipación (ver _comun.php). El
 *     administrador no tiene ese límite.
 *   - Si la reserva ya estaba cancelada, se avisa y no se hace nada.
 *   - Si había dinero cobrado, se registra el reembolso completo como un pago negativo
 *     (motivo "Reembolso por cancelación"), así el historial de cobros queda cuadrado.
 *   - Todo ocurre en una transacción: o se cancela y se reembolsa, o no pasa nada.
 *
 * NOTA: el reembolso es un REGISTRO contable. Devolver el dinero de verdad (a la tarjeta, en
 * efectivo, etc.) es un paso del negocio que se hace fuera del sistema.
 */
require_once __DIR__ . '/_comun.php';

$yo = exigir_login();
$d = entrada();
$id = (int)($d['pedido_id'] ?? 0);
$esAdmin = $yo['rol_id'] === ROL_ADMIN;

$conexion->beginTransaction();
try {
    $st = $conexion->prepare('SELECT id, nombre, usuario_id, estado_id FROM pedidos WHERE id = :id FOR UPDATE');
    $st->execute([':id' => $id]);
    $p = $st->fetch();

    // Para un cliente, una reserva ajena es igual a una que no existe (no se revela nada).
    if (!$p || (!$esAdmin && (int)$p['usuario_id'] !== $yo['id'])) {
        throw new ErrorNegocio('La reserva no existe.', 404);
    }
    if ((int)$p['estado_id'] === ESTADO_CANCELADA) {
        throw new ErrorNegocio('La reserva ya está cancelada.', 409);
    }

    if (!$esAdmin) {
        $limite = date('Y-m-d', strtotime('+' . DIAS_MINIMOS_PARA_CANCELAR . ' day'));
        $tarde = consultar(
            'SELECT e.nombre FROM pedido_items pi JOIN excursiones e ON e.id = pi.excursion_id
              WHERE pi.pedido_id = :p AND e.fecha_salida < :l LIMIT 1',
            [':p' => $id, ':l' => $limite]
        )[0] ?? null;
        if ($tarde) {
            throw new ErrorNegocio(
                'Ya no se puede cancelar: "' . $tarde['nombre'] . '" sale en menos de ' .
                (DIAS_MINIMOS_PARA_CANCELAR + 1) . ' días. Comunicate con nosotros.', 409
            );
        }
    }

    $conexion->prepare('UPDATE pedidos SET estado_id = :e WHERE id = :id')
        ->execute([':e' => ESTADO_CANCELADA, ':id' => $id]);
    $reembolso = reembolsar_pedido($id);

    $conexion->commit();
} catch (Throwable $e) {
    if ($conexion->inTransaction()) {
        $conexion->rollBack();
    }
    throw $e;
}

responder(['pedido' => leer_fila('pedidos', $id), 'reembolso' => $reembolso]);
