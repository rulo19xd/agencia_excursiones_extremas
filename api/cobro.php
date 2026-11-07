<?php
/*
 * DOCUMENTACIÓN - api/cobro.php   (POST, solo administradores)
 *
 *   { pedido_id, metodo, monto, nota }
 *
 * Registra un cobro (total o parcial) de una reserva: efectivo, transferencia, posnet u otro.
 * Queda como una fila en la tabla pagos (marca = método, motivo = nota) y se ve en el detalle
 * de la reserva y en la pantalla "Cobros" del panel.
 *
 * REGLAS
 *   - La reserva no puede estar cancelada.
 *   - El monto debe ser mayor a 0 y no puede superar el saldo pendiente (total - cobrado):
 *     no se puede cobrar de más.
 *   - Cuando lo cobrado alcanza el total, la reserva pasa sola a "Pagada".
 *   - Transacción con la reserva bloqueada (FOR UPDATE): dos cobros simultáneos no se pisan.
 */
require_once __DIR__ . '/_comun.php';

exigir_admin();
$d = entrada();

$id     = (int)($d['pedido_id'] ?? 0);
$metodo = (string)($d['metodo'] ?? '');
$nota   = mb_substr(trim((string)($d['nota'] ?? '')), 0, 255);
$monto  = $d['monto'] ?? null;

if (!in_array($metodo, METODOS_COBRO, true)) {
    fallar('Elegí un método de cobro válido.');
}
if (!is_numeric($monto) || (float)$monto <= 0 || (float)$monto > 99999999) {
    fallar('El monto debe ser mayor a 0.');
}
$monto = round((float)$monto, 2);

$conexion->beginTransaction();
try {
    $st = $conexion->prepare('SELECT id, total, estado_id FROM pedidos WHERE id = :id FOR UPDATE');
    $st->execute([':id' => $id]);
    $p = $st->fetch();

    if (!$p) {
        throw new ErrorNegocio('La reserva no existe.', 404);
    }
    if ((int)$p['estado_id'] === ESTADO_CANCELADA) {
        throw new ErrorNegocio('La reserva está cancelada: no se pueden registrar cobros.', 409);
    }

    $total = (float)$p['total'];
    $saldo = round($total - cobrado_de($id), 2);
    if ($saldo <= 0) {
        throw new ErrorNegocio('La reserva ya está cobrada por completo.', 409);
    }
    if ($monto > $saldo + 0.001) {
        throw new ErrorNegocio('El monto supera el saldo pendiente ($' . number_format($saldo, 2, ',', '.') . ').', 409);
    }

    $conexion->prepare(
        'INSERT INTO pagos (pedido_id, marca, ultimos4, monto, aprobado, motivo, creado_en)
         VALUES (:p, :m, NULL, :mo, 1, :mt, :f)'
    )->execute([
        ':p' => $id, ':m' => $metodo, ':mo' => $monto,
        ':mt' => $nota === '' ? null : $nota, ':f' => date('Y-m-d H:i:s'),
    ]);
    $pagoId = (int)$conexion->lastInsertId();

    if (round($saldo - $monto, 2) <= 0 && (int)$p['estado_id'] !== ESTADO_PAGADA) {
        $conexion->prepare('UPDATE pedidos SET estado_id = :e WHERE id = :id')
            ->execute([':e' => ESTADO_PAGADA, ':id' => $id]);
    }

    $conexion->commit();
} catch (Throwable $e) {
    if ($conexion->inTransaction()) {
        $conexion->rollBack();
    }
    throw $e;
}

responder(['pedido' => leer_fila('pedidos', $id), 'pago' => leer_fila('pagos', $pagoId)], 201);
