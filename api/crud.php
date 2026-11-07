<?php
/*
 * DOCUMENTACIÓN - api/crud.php   (POST, solo administradores)
 *
 *   { tabla, accion: "insertar" | "actualizar" | "eliminar", id, datos: {...} }
 *   (reservas: solo actualizar el estado o eliminar una CANCELADA; eliminar borra también sus ítems y pagos)
 *
 * Lo usa el panel de administración (dashboard/) para altas, ediciones y bajas.
 *
 * SEGURIDAD
 *   - Solo entra un administrador logueado (exigir_admin).
 *   - Solo se puede tocar una lista fija de tablas. Cada tabla tiene su función de
 *     validación, que devuelve ÚNICAMENTE las columnas permitidas: lo demás que mande
 *     el navegador se ignora.
 *   - Todas las consultas usan parámetros (no se arma SQL con texto del usuario).
 *   - Las contraseñas se guardan con password_hash() y nunca se devuelven.
 *   - En "actualizar" se parte de la fila actual y se pisan solo los campos enviados;
 *     por eso el panel puede mandar solo { activa: 0 } para desactivar una excursión.
 *
 * Los usuarios no se eliminan (se desactivan) y los pedidos solo permiten cambiar el estado:
 * pasar a Pagada exige que el cobro esté registrado, y cancelar registra el reembolso.
 */
require_once __DIR__ . '/_comun.php';

$yo = exigir_admin();
$d = entrada();

const TABLAS_EDITABLES = ['excursiones', 'usuarios', 'pedidos', 'tipos_excursion', 'paises', 'provincias', 'ciudades'];

$tabla  = (string)($d['tabla'] ?? '');
$accion = (string)($d['accion'] ?? '');
$id     = (int)($d['id'] ?? 0);
$datos  = is_array($d['datos'] ?? null) ? $d['datos'] : [];

if (!in_array($tabla, TABLAS_EDITABLES, true)) {
    fallar('Tabla no permitida.');
}
if (!in_array($accion, ['insertar', 'actualizar', 'eliminar'], true)) {
    fallar('Acción no permitida.');
}
if ($accion !== 'insertar' && $id <= 0) {
    fallar('Falta indicar qué registro.');
}
if ($tabla === 'pedidos' && $accion === 'insertar') {
    fallar('Las reservas se crean desde pedido.php.');
}
if ($tabla === 'usuarios' && $accion === 'eliminar') {
    fallar('Los usuarios no se eliminan: se desactivan.');
}

// ---------------------------------------------------------------------
// Validaciones (una por tabla). Devuelven [columna => valor] ya limpios.
// ---------------------------------------------------------------------

// Toma el valor enviado, o el actual si no lo enviaron.
function dato(array $d, ?array $actual, string $col, $porDefecto = '')
{
    if (array_key_exists($col, $d)) {
        return $d[$col];
    }
    return $actual[$col] ?? $porDefecto;
}

function validar_excursion(array $d, ?array $actual): array
{
    $nombre = trim((string)dato($d, $actual, 'nombre'));
    if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 255) {
        throw new ErrorNegocio('El nombre debe tener entre 3 y 255 caracteres.');
    }
    $desc = trim((string)dato($d, $actual, 'descripcion'));
    if (mb_strlen($desc) > 5000) {
        throw new ErrorNegocio('La descripción es demasiado larga.');
    }
    $tipo = (int)dato($d, $actual, 'tipo_excursion_id', 0);
    if (!existe('tipos_excursion', $tipo)) {
        throw new ErrorNegocio('El tipo de excursión no existe.');
    }
    $ciudad = (int)dato($d, $actual, 'ciudad_id', 0);
    if (!existe('ciudades', $ciudad)) {
        throw new ErrorNegocio('La ciudad no existe.');
    }
    $precio = dato($d, $actual, 'precio', 0);
    if (!is_numeric($precio) || (float)$precio <= 0 || (float)$precio > 99999999) {
        throw new ErrorNegocio('El precio debe ser mayor a 0.');
    }
    $cap = filter_var(dato($d, $actual, 'capacidad', 0), FILTER_VALIDATE_INT);
    if ($cap === false || $cap <= 0) {
        throw new ErrorNegocio('La capacidad debe ser mayor a 0.');
    }
    if ($actual !== null) {
        $ocupados = ocupados_de((int)$actual['id']);
        if ($cap < $ocupados) {
            throw new ErrorNegocio('Ya hay ' . $ocupados . ' lugares reservados: la capacidad no puede ser menor.');
        }
    }
    $fecha = (string)dato($d, $actual, 'fecha_salida');
    $dt = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        throw new ErrorNegocio('La fecha de salida es obligatoria.');
    }
    $img = trim((string)dato($d, $actual, 'imagen'));
    if (mb_strlen($img) > 255) {
        throw new ErrorNegocio('La ruta de la imagen es demasiado larga.');
    }

    return [
        'nombre'            => $nombre,
        'descripcion'       => $desc === '' ? null : $desc,
        'tipo_excursion_id' => $tipo,
        'ciudad_id'         => $ciudad,
        'precio'            => round((float)$precio, 2),
        'capacidad'         => $cap,
        'fecha_salida'      => $fecha,
        'imagen'            => $img === '' ? null : $img,
        'activa'            => ((int)dato($d, $actual, 'activa', 1)) ? 1 : 0,
    ];
}

function validar_usuario(array $d, ?array $actual, array $yo): array
{
    $nombre   = trim((string)dato($d, $actual, 'nombre'));
    $apellido = trim((string)dato($d, $actual, 'apellido'));
    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100)     throw new ErrorNegocio('Ingresá el nombre.');
    if (mb_strlen($apellido) < 2 || mb_strlen($apellido) > 100) throw new ErrorNegocio('Ingresá el apellido.');

    $email = strtolower(trim((string)dato($d, $actual, 'email')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
        throw new ErrorNegocio('El email no es válido.');
    }
    $otro = valor('SELECT 1 FROM usuarios WHERE email = :e AND id <> :id', [':e' => $email, ':id' => (int)($actual['id'] ?? 0)]);
    if ($otro !== false) {
        throw new ErrorNegocio('Ya existe una cuenta con ese email.', 409);
    }

    $dni = preg_replace('/\D/', '', (string)dato($d, $actual, 'dni'));
    if ($dni !== '' && (strlen($dni) < 7 || strlen($dni) > 8)) {
        throw new ErrorNegocio('El DNI debe tener 7 u 8 números.');
    }
    $telefono = trim((string)dato($d, $actual, 'telefono'));
    if (mb_strlen($telefono) > 50) {
        throw new ErrorNegocio('El teléfono es demasiado largo.');
    }

    $ciudad = dato($d, $actual, 'ciudad_id', null);
    $ciudad = ($ciudad === null || $ciudad === '') ? null : (int)$ciudad;
    if ($ciudad !== null && !existe('ciudades', $ciudad)) {
        throw new ErrorNegocio('La ciudad no existe.');
    }

    $rol    = (int)dato($d, $actual, 'rol_id', ROL_CLIENTE);
    $activo = ((int)dato($d, $actual, 'activo', 1)) ? 1 : 0;
    // Un administrador no puede quitarse el rol ni desactivarse a sí mismo
    // (así nunca te quedás afuera del panel por error).
    if ($actual !== null && (int)$actual['id'] === $yo['id']) {
        $rol = (int)$actual['rol_id'];
        $activo = (int)$actual['activo'];
    }
    if (!existe('roles', $rol)) {
        throw new ErrorNegocio('El rol no existe.');
    }

    $cols = [
        'nombre' => $nombre, 'apellido' => $apellido, 'email' => $email,
        'telefono' => $telefono, 'dni' => $dni, 'ciudad_id' => $ciudad,
        'rol_id' => $rol, 'activo' => $activo,
    ];

    // Contraseña: obligatoria al crear; al editar, vacía = se deja la que tenía.
    $pass = (string)($d['password'] ?? '');
    if ($actual === null || $pass !== '') {
        if (strlen($pass) < 4 || strlen($pass) > 200) {
            throw new ErrorNegocio('La contraseña debe tener al menos 4 caracteres.');
        }
        $cols['password'] = password_hash($pass, PASSWORD_DEFAULT);
    }
    return $cols;
}

function validar_pedido(array $d, array $actual): array
{
    $estado = (int)($d['estado_id'] ?? 0);
    if (!existe('estados_pedido', $estado)) {
        throw new ErrorNegocio('El estado no existe.');
    }
    // "Pagada" solo si ya se cobró todo (los cobros se registran en api/cobro.php).
    if ($estado === ESTADO_PAGADA && cobrado_de((int)$actual['id']) + 0.001 < (float)$actual['total']) {
        throw new ErrorNegocio('Para marcarla como pagada, registrá primero el cobro.', 409);
    }
    // Al reabrir una reserva cancelada hay que verificar que sigan quedando lugares.
    if ((int)$actual['estado_id'] === ESTADO_CANCELADA && $estado !== ESTADO_CANCELADA) {
        $items = consultar(
            'SELECT pi.excursion_id, pi.personas, e.nombre, e.capacidad
               FROM pedido_items pi JOIN excursiones e ON e.id = pi.excursion_id
              WHERE pi.pedido_id = :p',
            [':p' => (int)$actual['id']]
        );
        foreach ($items as $it) {
            $libres = max(0, (int)$it['capacidad'] - ocupados_de((int)$it['excursion_id']));
            if ((int)$it['personas'] > $libres) {
                throw new ErrorNegocio('Ya no quedan lugares en "' . $it['nombre'] . '".', 409);
            }
        }
    }
    return ['estado_id' => $estado];
}

function validar_catalogo(string $tabla, array $d, ?array $actual): array
{
    $nombre = trim((string)dato($d, $actual, 'nombre'));
    if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 255) {
        throw new ErrorNegocio('El nombre debe tener entre 2 y 255 caracteres.');
    }
    $cols = ['nombre' => $nombre];
    if ($tabla === 'provincias') {
        $padre = (int)dato($d, $actual, 'pais_id', 0);
        if (!existe('paises', $padre)) throw new ErrorNegocio('El país no existe.');
        $cols['pais_id'] = $padre;
    } elseif ($tabla === 'ciudades') {
        $padre = (int)dato($d, $actual, 'provincia_id', 0);
        if (!existe('provincias', $padre)) throw new ErrorNegocio('La provincia no existe.');
        $cols['provincia_id'] = $padre;
    }
    return $cols;
}

// ---------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------
try {
    if ($accion === 'eliminar') {
        if (!existe($tabla, $id)) {
            fallar('El registro no existe.', 404);
        }
        if ($tabla === 'pedidos') {
            // Solo se borran reservas CANCELADAS (las vigentes primero hay que cancelarlas).
            // Se borra todo el rastro: ítems y pagos (incluido el reembolso) y la reserva, todo o nada.
            $p = leer_cruda('pedidos', $id);
            if ((int)$p['estado_id'] !== ESTADO_CANCELADA) {
                fallar('Solo se pueden eliminar reservas canceladas.', 409);
            }
            $conexion->beginTransaction();
            try {
                $conexion->prepare('DELETE FROM pagos WHERE pedido_id = :id')->execute([':id' => $id]);
                $conexion->prepare('DELETE FROM pedido_items WHERE pedido_id = :id')->execute([':id' => $id]);
                $conexion->prepare('DELETE FROM pedidos WHERE id = :id')->execute([':id' => $id]);
                $conexion->commit();
            } catch (Throwable $ex) {
                if ($conexion->inTransaction()) {
                    $conexion->rollBack();
                }
                throw $ex;
            }
            responder(['ok' => true]);
        }
        if ($tabla === 'excursiones') {
            // Mensaje claro si la excursión tiene reservas (aunque estén canceladas, la base no deja borrarla)
            $f = consultar(
                'SELECT COUNT(*) AS total, SUM(CASE WHEN p.estado_id <> :c THEN 1 ELSE 0 END) AS vigentes
                   FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id WHERE pi.excursion_id = :id',
                [':c' => ESTADO_CANCELADA, ':id' => $id]
            );
            if ((int)($f[0]['total'] ?? 0) > 0) {
                fallar((int)($f[0]['vigentes'] ?? 0) > 0
                    ? 'No se puede eliminar: tiene reservas vigentes. Cancelalas y eliminá las reservas canceladas desde Reservas.'
                    : 'No se puede eliminar: tiene reservas canceladas. Eliminalas desde Reservas y probá de nuevo.', 409);
            }
        }
        $conexion->prepare("DELETE FROM `$tabla` WHERE id = :id")->execute([':id' => $id]);
        responder(['ok' => true]);
    }

    $actual = null;
    if ($accion === 'actualizar') {
        $actual = leer_cruda($tabla, $id);
        if (!$actual) {
            fallar('El registro no existe.', 404);
        }
    }

    switch ($tabla) {
        case 'excursiones': $cols = validar_excursion($datos, $actual); break;
        case 'usuarios':    $cols = validar_usuario($datos, $actual, $yo); break;
        case 'pedidos':     $cols = validar_pedido($datos, $actual); break;
        default:            $cols = validar_catalogo($tabla, $datos, $actual);
    }

    // Los nombres de columna salen de las funciones de arriba (nunca del navegador).
    $nombres = array_keys($cols);
    if ($accion === 'insertar') {
        $sql = "INSERT INTO `$tabla` (`" . implode('`, `', $nombres) . '`) VALUES (:' . implode(', :', $nombres) . ')';
        $conexion->prepare($sql)->execute($cols);
        $id = (int)$conexion->lastInsertId();
    } else {
        $sets = [];
        foreach ($nombres as $n) {
            $sets[] = "`$n` = :$n";
        }
        $params = $cols;
        $params['__id'] = $id;
        // Cancelar una reserva con dinero cobrado registra también el reembolso (todo o nada).
        $cancela = $tabla === 'pedidos' && (int)$cols['estado_id'] === ESTADO_CANCELADA
            && (int)$actual['estado_id'] !== ESTADO_CANCELADA;
        if ($cancela) {
            $conexion->beginTransaction();
        }
        try {
            $conexion->prepare("UPDATE `$tabla` SET " . implode(', ', $sets) . ' WHERE id = :__id')->execute($params);
            if ($cancela) {
                reembolsar_pedido($id);
                $conexion->commit();
            }
        } catch (Throwable $e) {
            if ($cancela && $conexion->inTransaction()) {
                $conexion->rollBack();
            }
            throw $e;
        }
    }

    responder(['fila' => leer_fila($tabla, $id)], $accion === 'insertar' ? 201 : 200);

} catch (PDOException $e) {
    $codigo = (int)($e->errorInfo[1] ?? 0);
    if ($codigo === 1451) {
        fallar('No se puede eliminar: está en uso por otros registros.', 409);
    }
    if ($codigo === 1452) {
        fallar('Alguno de los datos elegidos no existe.', 409);
    }
    if ($codigo === 1062) {
        fallar('Ya existe un registro con esos datos.', 409);
    }
    throw $e;
}
