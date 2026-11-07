(function () {
  'use strict';

  var fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function fecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  var ETIQUETA = { pendiente: 'Pendiente de pago', pagada: 'Pagada', cancelada: 'Cancelada' };
  var COLOR = { pendiente: '#b7791f', pagada: '#2f855a', cancelada: '#c53030' };

  var enlazado = false;
  function init() {
    var raiz = document.getElementById('mis-reservas');
    if (!raiz) return;
    var u = SesionSitio.exigirLogin();
    if (!u) return;

   
    if (!enlazado) {
      enlazado = true;
      raiz.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cancelar]');
        if (!b) return;
        var id = Number(b.getAttribute('data-cancelar'));
        if (!window.confirm('¿Seguro que querés cancelar esta reserva? Esta acción no se puede deshacer.')) return;
        b.disabled = true;
        try {
          var r = Datos.cancelarPedido(id);
          window.alert(r.reembolso > 0 ? 'Reserva cancelada. Se reembolsaron ' + fmt.format(r.reembolso) + '.' : 'Reserva cancelada.');
        } catch (err) {
          window.alert(err.message);
        }
        init();
      });
    }

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
      var pagos = Datos.pagosDe(p.id).filter(function (x) { return x.aprobado; });
      var pago = pagos.filter(function (x) { return Number(x.monto) > 0; })[0];
      var devuelto = pagos.reduce(function (t, x) { return t + (Number(x.monto) < 0 ? -Number(x.monto) : 0); }, 0);
      var detallePago = '';
      if (pago) {
        detallePago = pago.ultimos4
          ? ' · Pagada con ' + esc(pago.marca) + ' ···· ' + esc(pago.ultimos4)
          : ' · Pago registrado: ' + esc(pago.marca);
      }
      var aviso = '';
      if (estado === 'cancelada') {
        aviso = devuelto > 0
          ? '<p class="small mb-0 mt-2" style="color:#2f855a">Reserva cancelada. Se reembolsaron ' + fmt.format(devuelto) + '.</p>'
          : '<p class="small mb-0 mt-2 text-muted">Reserva cancelada.</p>';
      }
      var botonCancelar = Datos.puedeCancelar(p)
        ? '<button type="button" class="btn btn-outline-danger btn-sm mt-3" data-cancelar="' + p.id + '">Cancelar reserva</button>' +
          '<small class="d-block text-muted mt-1">Podés cancelar hasta ' + Datos.DIAS_MINIMOS_PARA_CANCELAR + ' día antes de la salida' +
          (pago ? '; se te reembolsa lo pagado.' : '.') + '</small>'
        : '';
      return '<div class="co-card">' +
        '<h4><span>Reserva ' + esc(p.codigo) + '</span>' +
        '<span style="font-size:13px;font-weight:600;color:' + (COLOR[estado] || '#555') + '">' + esc(ETIQUETA[estado] || estado) + '</span></h4>' +
        '<p class="small text-muted mb-2">Realizada el ' + fecha(p.creado_en) + detallePago + '</p>' +
        '<ul class="cart-list co-items">' + items + '</ul>' +
        '<div class="cart-row cart-row-total mt-2"><span>Total</span><strong>' + fmt.format(p.total) + '</strong></div>' +
        aviso + botonCancelar + '</div>';
    }).join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
 
