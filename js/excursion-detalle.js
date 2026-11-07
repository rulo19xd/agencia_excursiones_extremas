/*
 * DOCUMENTACIÓN - excursion-detalle.js (página excursion.html)
 *
 * Muestra el detalle de UNA excursión de la base. La dirección es excursion.html?id=NÚMERO
 * (el id de la tabla excursiones); a esa página llegan los enlaces "Descubrir" de las
 * tarjetas de tour.html e index.html.
 *
 * QUÉ MUESTRA: foto, nombre, tipo, lugar (ciudad, provincia, país), fecha de salida, precio
 * por persona, lugares libres, descripción y un selector de personas con el botón
 * "Agregar al carrito" (lo atiende carrito.js mediante el atributo data-cart-add).
 *
 * Si la excursión no existe, está desactivada o ya salió, se avisa y se ofrece volver al
 * listado. Las desactivadas solo pueden verlas los administradores.
 *
 * ORDEN DE CARGA: después de datos.js y antes de main.js (igual que excursiones-web.js).
 */
(function () {
  'use strict';
  var raiz = document.getElementById('excursion-detalle');
  if (!raiz || !window.Datos) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function urlCss(p) { return encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27'); }
  function dinero(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fechaLarga(iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function lugarCompleto(ex) {
    var c = Datos.buscar('ciudades', ex.ciudad_id);
    if (!c) return '';
    var p = Datos.buscar('provincias', c.provincia_id);
    var pa = p ? Datos.buscar('paises', p.pais_id) : null;
    return c.nombre + (p ? ', ' + p.nombre : '') + (pa ? ' (' + pa.nombre + ')' : '');
  }
  function lugarCorto(ex) {
    var c = Datos.buscar('ciudades', ex.ciudad_id);
    var p = c ? Datos.buscar('provincias', c.provincia_id) : null;
    var pa = p ? Datos.buscar('paises', p.pais_id) : null;
    return c ? c.nombre + (pa ? ', ' + pa.nombre : '') : '';
  }

  function noDisponible(msg) {
    document.getElementById('det-titulo').textContent = 'Excursión no disponible';
    raiz.innerHTML = '<div class="text-center py-5"><p class="mb-4">' + esc(msg) + '</p>' +
      '<a href="tour.html" class="btn btn-primary py-3 px-5">Ver todas las excursiones</a></div>';
  }

  var id = parseInt(new URLSearchParams(location.search).get('id'), 10);
  var ex = id > 0 ? Datos.buscar('excursiones', id) : null;
  var sesion = Datos.sesion();
  var admin = !!sesion && Datos.esAdmin(sesion);

  if (!ex) {
    noDisponible('No encontramos esa excursión. Puede que ya no esté publicada.');
    return;
  }
  if (!admin && (!ex.activa || ex.fecha_salida < hoyISO())) {
    noDisponible(ex.activa ? 'Esta excursión ya salió.' : 'Esta excursión no está disponible por el momento.');
    return;
  }

  var tipo = Datos.nombreDe('tipos_excursion', ex.tipo_excursion_id);
  var libres = Datos.libres(ex.id);
  var img = ex.imagen || 'images/destination-1.jpg';
  var yaSalio = ex.fecha_salida < hoyISO();
  var reservable = !!ex.activa && !yaSalio && libres > 0;

  document.title = ex.nombre + ' | Vertigo';
  document.getElementById('det-titulo').textContent = ex.nombre;
  document.getElementById('det-migas').textContent = ex.nombre;
  document.getElementById('det-hero').style.backgroundImage = "url('" + urlCss(img) + "')";

  var tope = Math.min(10, libres);
  var opciones = '';
  for (var i = 1; i <= tope; i++) opciones += '<option value="' + i + '">' + i + (i === 1 ? ' persona' : ' personas') + '</option>';

  var cupo = libres === 0 ? 'Agotada' : (libres <= 5 ? '¡Últimos ' + libres + ' lugares!' : libres + ' lugares libres');

  var aviso = '';
  if (admin && !ex.activa) aviso = '<div class="alert alert-warning">Esta excursión está <strong>desactivada</strong>: solo la ves vos como administrador.</div>';
  else if (admin && yaSalio) aviso = '<div class="alert alert-warning">Esta excursión <strong>ya salió</strong>: solo la ves vos como administrador.</div>';

  var compra = reservable
    ? '<div class="form-group"><label for="det-personas">¿Cuántas personas?</label>' +
        '<select id="det-personas" class="form-control">' + opciones + '</select></div>' +
      '<p class="mb-3">Total: <strong id="det-total">' + dinero(ex.precio) + '</strong></p>' +
      '<button type="button" class="btn btn-primary btn-block py-3" id="det-agregar"' +
        ' data-cart-add="' + esc(Datos.slug(ex.nombre)) + '" data-nombre="' + esc(ex.nombre) + '"' +
        ' data-precio="' + Math.round(ex.precio) + '" data-imagen="' + esc(img) + '" data-lugar="' + esc(lugarCorto(ex)) + '"' +
        ' data-personas="1">Agregar al carrito</button>'
    : '<button type="button" class="btn btn-secondary btn-block py-3" disabled>' + (libres === 0 ? 'Agotada' : 'No disponible') + '</button>';

  raiz.innerHTML = aviso +
    '<div class="row">' +
      '<div class="col-lg-7 mb-4">' +
        '<div style="width:100%;height:420px;border-radius:6px;background-size:cover;background-position:center;background-image:url(\'' + esc(urlCss(img)) + '\')" role="img" aria-label="' + esc(ex.nombre) + '"></div>' +
        '<h3 class="mt-4">Sobre esta excursión</h3>' +
        '<p style="white-space:pre-line">' + esc(ex.descripcion || 'Pronto vamos a sumar más información sobre esta excursión.') + '</p>' +
      '</div>' +
      '<div class="col-lg-5 mb-4">' +
        '<div class="p-4 bg-light" style="border-radius:6px">' +
          '<p class="mb-1 text-muted">' + esc(tipo) + '</p>' +
          '<h2 class="mb-3">' + esc(ex.nombre) + '</h2>' +
          '<p class="mb-1"><i class="icon-map-o"></i> ' + esc(lugarCompleto(ex)) + '</p>' +
          '<p class="mb-1"><strong>Salida:</strong> ' + esc(fechaLarga(ex.fecha_salida)) + '</p>' +
          '<p class="mb-3"><strong>Disponibilidad:</strong> ' + cupo + '</p>' +
          '<p class="h3 mb-4">' + dinero(ex.precio) + ' <small class="text-muted" style="font-size:14px">por persona</small></p>' +
          compra +
          '<a href="tour.html" class="btn btn-link btn-block mt-2">&larr; Volver a las excursiones</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  // El selector actualiza el total y la cantidad que lee carrito.js al hacer clic
  var sel = document.getElementById('det-personas');
  if (sel) {
    sel.addEventListener('change', function () {
      var n = parseInt(sel.value, 10) || 1;
      document.getElementById('det-agregar').setAttribute('data-personas', n);
      document.getElementById('det-total').textContent = dinero(ex.precio * n);
    });
  }
})();
