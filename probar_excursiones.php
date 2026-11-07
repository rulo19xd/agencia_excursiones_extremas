<?php
require_once("conexion.php");

$sql = "SELECT
            e.id,
            e.nombre,
            e.descripcion,
            e.precio,
            e.capacidad,
            e.fecha_salida,
            t.nombre AS tipo,
            c.nombre AS ciudad
        FROM excursiones e
        INNER JOIN tipos_excursion t
            ON e.tipo_excursion_id = t.id
        INNER JOIN ciudades c
            ON e.ciudad_id = c.id
        WHERE e.activa = 1";

try {
    $consulta = $conexion->query($sql);
    $excursiones = $consulta->fetchAll(PDO::FETCH_ASSOC);
    echo "<h1>Excursiones disponibles</h1>";

    foreach ($excursiones as $excursion) {
        echo "<hr>";
        echo "<h2>" . htmlspecialchars($excursion['nombre']) . "</h2>";
        echo "<p>Descripción: " . htmlspecialchars($excursion['descripcion']) . "</p>";
        echo "<p>Tipo: " . htmlspecialchars($excursion['tipo']) . "</p>";
        echo "<p>Ciudad: " . htmlspecialchars($excursion['ciudad']) . "</p>";
        echo "<p>Precio: " . htmlspecialchars($excursion['precio']) . "</p>";
        echo "<p>Capacidad: " . htmlspecialchars($excursion['capacidad']) . "</p>";
        echo "<p>Fecha: " . htmlspecialchars($excursion['fecha_salida']) . "</p>";
    }

    if (count($excursiones) == 0) {
        echo "No hay excursiones disponibles.";
    }

} catch (PDOException $e) {
    echo "Error al consultar excursiones: " . $e->getMessage();
}
?>