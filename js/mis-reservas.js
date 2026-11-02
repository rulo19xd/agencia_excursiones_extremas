/*
 * DOCUMENTACIÓN - mis-reservas.js (página mis-reservas.html)
 *
 * Muestra al cliente logueado SUS pedidos (tabla pedidos filtrada por usuario_id), con las
 * excursiones de cada uno (pedido_items), el estado y cómo se pagó (pagos).
 * Si no hay sesión, redirige a login.html y vuelve acá al ingresar.
 *
 * CUANDO HAYA BACKEND: la lista sale de una consulta SQL por usuario (WHERE usuario_id = ?).
 */
(function () {
  'use strict';

  var fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fecha(iso) { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }); }

  var ETIQUETA = { pendiente: 'Pendiente de pago', pagada: 'Pagada', cancelada: 'Cancelada' };
  var COLOR = { pendiente: '#b7791f', pagada: '#2f855a', cancelada: '#c53030' };

  function init() {
    var raiz = document.getElementById('mis-reservas');
    if (!raiz) return;
    var u = SesionSitio.exigirLogin();
    if (!u) return;

    var pedidos = Datos.tabla('pedidos').filter(function (p) { return p.usuario_id === u.id; })
      .sort(function (a, b) { return b.creado_en.localeCompare(a.creado_en); });

    if (!pedidos.length) {
      raiz.innerHTML = '<div class="cart-empty"><p>Todavía no tenés reservas</p><a href="tour.html" class="btn btn-primary py-2 px-4">Ver excursiones</a></div>';
      return;
    }

    raiz.innerHTML = pedidos.map(function (p) {
      var estado = Datos.nombreDe('estados_pedido', p.estado_id);
      var items = Datos.itemsDe(p.id).map(function (it) {
        var ex = Datos.buscar('excursiones', it.excursion_id);
        return '<li class="cart-item">' +
          '<div class="cart-item-img" style="background-image:url(\'' + esc(ex ? ex.imagen : '') + '\')"></div>' +
          '<div class="cart-item-info"><strong>' + esc(ex ? ex.nombre : 'Excursión eliminada') + '</strong>' +
          '<small>' + it.personas + (it.personas === 1 ? ' persona' : ' personas') + ' × ' + fmt.format(it.precio_unitario) +
          (ex && ex.fecha_salida ? ' · Salida: ' + fecha(ex.fecha_salida) : '') + '</small></div>' +
          '<div class="cart-item-side"><span class="cart-item-total">' + fmt.format(it.personas * it.precio_unitario) + '</span></div></li>';
      }).join('');
      var pago = Datos.pagosDe(p.id).filter(function (x) { return x.aprobado; })[0];
      return '<div class="co-card">' +
        '<h4><span>Reserva ' + esc(p.codigo) + '</span>' +
        '<span style="font-size:13px;font-weight:600;color:' + (COLOR[estado] || '#555') + '">' + esc(ETIQUETA[estado] || estado) + '</span></h4>' +
        '<p class="small text-muted mb-2">Realizada el ' + fecha(p.creado_en) + (pago ? ' · Pagada con ' + esc(pago.marca) + ' ···· ' + esc(pago.ultimos4) : '') + '</p>' +
        '<ul class="cart-list co-items">' + items + '</ul>' +
        '<div class="cart-row cart-row-total mt-2"><span>Total</span><strong>' + fmt.format(p.total) + '</strong></div></div>';
    }).join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
