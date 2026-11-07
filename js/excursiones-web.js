/*
 * DOCUMENTACIÓN - excursiones-web.js (excursiones del sitio público, leídas de la base)
 *
 * Dibuja las tarjetas de excursiones a partir de la tabla "excursiones" (vía datos.js):
 *
 *   tour.html    -> <div id="tour-lista">: todas las excursiones, con filtros (tipo,
 *                   ubicación, fecha de salida y precio) y paginación de 9 en 9.
 *                   Acepta filtros por dirección: tour.html?tipo=ID&pais=ID&lugar=ID&desde=&hasta=&pmin=&pmax=
 *   index.html   -> <div id="paquetes-destacados">: las 5 próximas salidas, y el buscador de
 *                   la portada (#buscador-portada, manda tipo y país a tour.html).
 *
 * QUÉ SE MUESTRA
 *   Solo excursiones ACTIVAS cuya fecha de salida no pasó (el servidor tampoco deja
 *   comprar una excursión que ya salió). Si desde el panel se desactiva, se edita o se
 *   crea una excursión, el sitio lo refleja en la próxima carga de la página.
 *
 * CARRITO
 *   El botón "Agregar al carrito" usa el atributo data-cart-add de carrito.js. El id es el
 *   nombre de la excursión pasado por Datos.slug(): es el mismo que usa el checkout para
 *   encontrar la excursión en la base, así que no hay que cambiar nada en el carrito.
 *
 * ORDEN DE CARGA: este archivo va DESPUÉS de datos.js y ANTES de main.js. Así las tarjetas
 * ya existen cuando main.js activa la animación de entrada (clase ftco-animate).
 */
(function () {
  'use strict';
  if (!window.Datos) return;

  // ---------- tarjetas de igual altura ----------
  // Cada columna es flex y la tarjeta ocupa todo su alto; dentro, la línea y lo que sigue
  // (ubicación + botón) se empujan hacia abajo; el renglón de ubicación reserva dos líneas. Así, aunque un texto sea más corto o más
  // largo, todas las tarjetas de una fila miden lo mismo y sus botones quedan alineados.
  var estilo = document.createElement('style');
  estilo.textContent =
    '#tour-lista > div, #paquetes-destacados > div { display: flex; }' +
    '#tour-lista .destination, #paquetes-destacados .destination { display: flex; flex-direction: column; width: 100%; }' +
    '#tour-lista .destination .text, #paquetes-destacados .destination .text { display: flex; flex-direction: column; flex: 1 1 auto; }' +
    '#tour-lista .destination .text hr, #paquetes-destacados .destination .text hr { margin-top: auto; width: 100%; }' +
    '#tour-lista .destination .text .days, #paquetes-destacados .destination .text .days { margin-bottom: 1rem; }' +
    '#tour-lista .destination .text .bottom-area, #paquetes-destacados .destination .text .bottom-area { min-height: 3.7em; align-items: flex-start; }';
  document.head.appendChild(estilo);

  var POR_PAGINA = 9;

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Ruta de imagen segura para usar dentro de url(...)
  function urlCss(p) {
    return encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27');
  }
  function dinero(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }
  function fechaCorta(iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // Excursiones que se muestran al público, de la salida más próxima a la más lejana
  function visibles() {
    var hoy = hoyISO();
    return Datos.tabla('excursiones')
      .filter(function (e) { return e.activa && e.fecha_salida >= hoy; })
      .sort(function (a, b) {
        return a.fecha_salida < b.fecha_salida ? -1 : a.fecha_salida > b.fecha_salida ? 1 : a.id - b.id;
      });
  }

  // "Palermo, Italia"
  function lugar(ex) {
    var c = Datos.buscar('ciudades', ex.ciudad_id);
    if (!c) return '';
    var p = Datos.buscar('provincias', c.provincia_id);
    var pa = p ? Datos.buscar('paises', p.pais_id) : null;
    return c.nombre + (pa ? ', ' + pa.nombre : '');
  }

  // id del país de una excursión (ciudad -> provincia -> país)
  function paisId(ex) {
    var c = Datos.buscar('ciudades', ex.ciudad_id);
    var p = c ? Datos.buscar('provincias', c.provincia_id) : null;
    return p ? p.pais_id : null;
  }

  // ---------- tarjeta ----------
  // o = { col: clases de la columna, boton: true/false }. Todos los enlaces van al detalle (excursion.html?id=N).
  function tarjeta(ex, o) {
    var libres = Datos.libres(ex.id);
    var cupo = libres === 0 ? 'Agotada' : (libres <= 5 ? '¡Últimos ' + libres + ' lugares!' : libres + ' lugares libres');
    var img = ex.imagen || 'images/destination-1.jpg';
    o.enlace = 'excursion.html?id=' + ex.id;
    var lug = lugar(ex);
    var tipo = Datos.nombreDe('tipos_excursion', ex.tipo_excursion_id);

    var boton = '';
    if (o.boton) {
      boton = libres === 0
        ? '<button type="button" class="btn btn-primary btn-block cart-add mt-2" disabled>Agotada</button>'
        : '<button type="button" class="btn btn-primary btn-block cart-add mt-2"' +
          ' data-cart-add="' + esc(Datos.slug(ex.nombre)) + '" data-nombre="' + esc(ex.nombre) + '"' +
          ' data-precio="' + Math.round(ex.precio) + '" data-imagen="' + esc(img) + '" data-lugar="' + esc(lug) + '">Agregar al carrito</button>';
    }

    return '<div class="' + o.col + '">' +
      '<div class="destination">' +
        '<a href="' + esc(o.enlace) + '" class="img img-2 d-flex justify-content-center align-items-center" style="background-image: url(' + esc(urlCss(img)) + ');">' +
          '<div class="icon d-flex justify-content-center align-items-center"><span class="icon-search2"></span></div>' +
        '</a>' +
        '<div class="text p-3">' +
          '<div class="d-flex">' +
            '<div class="one"><h3><a href="' + esc(o.enlace) + '">' + esc(ex.nombre) + '</a></h3>' +
              '<p class="rate"><span>' + esc(tipo) + '</span></p></div>' +
            '<div class="two"><span class="price">' + dinero(ex.precio) + '</span></div>' +
          '</div>' +
          '<p>' + esc(ex.descripcion) + '</p>' +
          '<p class="days"><span>Salida: ' + fechaCorta(ex.fecha_salida) + ' · ' + cupo + '</span></p>' +
          '<hr>' +
          '<p class="bottom-area d-flex">' +
            '<span><i class="icon-map-o"></i> ' + esc(lug) + '</span> ' +
            '<span class="ml-auto"><a href="' + esc(o.enlace) + '">Descubrir</a></span>' +
          '</p>' +
          boton +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Rellena un par de selectores (tipo, lugar) solo con lo que hoy tiene excursiones disponibles
  function llenarOpciones(selTipo, selLugar, selPais) {
    var tipos = {}, lugares = {};
    visibles().forEach(function (e) {
      tipos[e.tipo_excursion_id] = Datos.nombreDe('tipos_excursion', e.tipo_excursion_id);
      lugares[e.ciudad_id] = lugar(e);
    });
    if (selPais) {
      // solo los países (de la tabla paises) que tienen excursiones disponibles
      var paises = {};
      visibles().forEach(function (e) { var id = paisId(e); if (id) paises[id] = Datos.nombreDe('paises', id); });
      llenarSel(selPais, paises);
    }
    function llenarSel(select, mapa) {
      Object.keys(mapa).sort(function (a, b) { return mapa[a].localeCompare(mapa[b]); }).forEach(function (id) {
        var o = document.createElement('option');
        o.value = id; o.textContent = mapa[id];
        select.appendChild(o);
      });
    }
    llenarSel(selTipo, tipos);
    if (selLugar) llenarSel(selLugar, lugares);
  }

  // =====================================================================
  // tour.html
  // =====================================================================
  function iniciarTour() {
    var lista = document.getElementById('tour-lista');
    if (!lista) return;

    var todas = visibles();
    var $ = function (id) { return document.getElementById(id); };
    var form = $('tour-filtros'), pagina = 1, primeraVez = true;

    // Opciones de los filtros: solo tipos y lugares que realmente tienen excursiones
    llenarOpciones($('f-tipo'), $('f-lugar'));
    var pais = '';

    // Filtros que llegan en la dirección (buscador de la portada): tour.html?tipo=2&lugar=5&desde=...&pmax=...
    var q = new URLSearchParams(location.search);
    [['tipo', 'f-tipo'], ['lugar', 'f-lugar'], ['desde', 'f-desde'], ['hasta', 'f-hasta'], ['pmin', 'f-pmin'], ['pmax', 'f-pmax']]
      .forEach(function (par) { if (q.get(par[0])) $(par[1]).value = q.get(par[0]); });
    // tour.html?pais=ID (buscador de la portada): se filtra por país sin tocar los demás filtros
    if (q.get('pais')) pais = q.get('pais');

    function filtradas() {
      var tipo = $('f-tipo').value, ciudad = $('f-lugar').value;
      var desde = $('f-desde').value, hasta = $('f-hasta').value;
      var pmin = $('f-pmin').value === '' ? null : Number($('f-pmin').value);
      var pmax = $('f-pmax').value === '' ? null : Number($('f-pmax').value);
      return todas.filter(function (e) {
        return (!tipo || String(e.tipo_excursion_id) === tipo) &&
               (!ciudad || String(e.ciudad_id) === ciudad) &&
               (!pais || String(paisId(e)) === pais) &&
               (!desde || e.fecha_salida >= desde) &&
               (!hasta || e.fecha_salida <= hasta) &&
               (pmin === null || e.precio >= pmin) &&
               (pmax === null || e.precio <= pmax);
      });
    }

    function pintar() {
      var filas = filtradas();
      var paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
      if (pagina > paginas) pagina = paginas;
      var trozo = filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

      // La primera vez las tarjetas llevan ftco-animate (main.js las anima al hacer scroll).
      // Las que se dibujan después, al filtrar, no: main.js ya no las vería y quedarían invisibles.
      var col = 'col-md-4' + (primeraVez ? ' ftco-animate' : '');
      primeraVez = false;

      $('tour-cuenta').textContent = filas.length + (filas.length === 1 ? ' excursión encontrada' : ' excursiones encontradas');
      lista.innerHTML = trozo.length
        ? trozo.map(function (e) { return tarjeta(e, { col: col, boton: true }); }).join('')
        : '<div class="col-12"><p class="text-center py-5">' +
            (todas.length ? 'No hay excursiones que coincidan con tu búsqueda.' : 'Por el momento no hay excursiones disponibles.') +
          '</p></div>';

      // paginación (solo si hace falta)
      var ul = $('tour-paginacion'), h = '';
      if (paginas > 1) {
        h += '<li><a href="#" data-p="' + Math.max(1, pagina - 1) + '">&lt;</a></li>';
        for (var i = 1; i <= paginas; i++) {
          h += i === pagina ? '<li class="active"><span>' + i + '</span></li>' : '<li><a href="#" data-p="' + i + '">' + i + '</a></li>';
        }
        h += '<li><a href="#" data-p="' + Math.min(paginas, pagina + 1) + '">&gt;</a></li>';
      }
      ul.innerHTML = h;
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); pagina = 1; pintar(); });
    form.addEventListener('reset', function () { pais = ''; setTimeout(function () { pagina = 1; pintar(); }, 0); });
    $('tour-paginacion').addEventListener('click', function (e) {
      var a = e.target.closest('[data-p]');
      if (!a) return;
      e.preventDefault();
      pagina = Number(a.getAttribute('data-p'));
      pintar();
      lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    pintar();
  }

  // =====================================================================
  // index.html: "Mejores paquetes" = las 5 próximas salidas
  // =====================================================================
  function iniciarInicio() {
    var cont = document.getElementById('paquetes-destacados');
    if (!cont) return;
    var ex = visibles().slice(0, 5);
    cont.innerHTML = ex.length
      ? ex.map(function (e) { return tarjeta(e, { col: 'col-sm col-md-6 col-lg ftco-animate', boton: false }); }).join('')
      : '<div class="col-12 text-center"><p>Pronto vamos a publicar nuevas excursiones.</p>' +
        '<a href="tour.html" class="btn btn-primary py-3 px-5">Ver excursiones</a></div>';
  }

  // Buscador de la portada (index.html): solo completa las opciones; el envío lo hace el propio <form> (GET a tour.html)
  function iniciarBuscador() {
    var t = document.getElementById('bq-tipo'), l = document.getElementById('bq-pais');
    if (t && l) llenarOpciones(t, null, l);
  }

  iniciarTour();
  iniciarInicio();
  iniciarBuscador();
})();
