/*
 * Carrito de compras de Vertigo (solo front, sin base de datos).
 *
 * QUÉ HACE
 * - Guarda el carrito en localStorage ("vertigo_carrito"): sobrevive a recargas
 *   y cambios de página, pero es propio de cada navegador.
 * - Inyecta por JS el botón del navbar, el panel lateral y los avisos, así que
 *   los HTML solo necesitan la etiqueta <script src="js/carrito.js">.
 * - Agrega "Agregar al carrito" a las tarjetas de tour.html.
 * - Cualquier botón con data-cart-add="id" data-nombre data-precio data-imagen
 *   data-lugar también agrega al carrito (sirve para el detalle de una excursión).
 *
 * CÓMO ESTÁ ORGANIZADO (de arriba hacia abajo)
 *   1. utilidades        -> formato de dinero, escape de HTML, slug, crear nodos
 *   2. objeto Carrito    -> TODA la lógica de datos (agregar, quitar, total...)
 *   3. vistas            -> funciones que devuelven el HTML de cada fila
 *   4. panel + botón     -> construirUI(), abrir/cerrar, aviso
 *   5. tarjetas          -> mejorarTarjetas() y botones data-cart-add
 *   6. carrito.html      -> pintarPagina()
 *   7. init              -> arma todo cuando carga la página
 *
 * CUANDO HAYA BACKEND: solo cambian cargar() y guardar() del objeto Carrito
 * (por llamadas fetch a PHP). El resto de la pantalla no se toca.
 *
 * FLUJO DE ACTUALIZACIÓN: toda modificación pasa por Carrito.guardar(), que
 * dispara el evento "carrito:cambio"; ese evento vuelve a pintar contador,
 * panel y página del carrito. Por eso nunca hay que actualizar la pantalla a mano.
 */
(function () {
  'use strict';

  var CLAVE = 'vertigo_carrito';
  var MAX_PERSONAS = 10;

  // ---------- utilidades ----------
  var fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  function dinero(n) { return fmt.format(n); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  // ---------- almacenamiento ----------
  // Cada ítem se guarda así: { id, nombre, precio, imagen, lugar, personas }
  // "id" identifica la excursión: si se agrega la misma dos veces se suman personas.
  var Carrito = {
    // Lee el carrito. Si no hay nada o el JSON está roto, devuelve lista vacía.
    cargar: function () {
      try {
        var datos = JSON.parse(localStorage.getItem(CLAVE));
        return Array.isArray(datos) ? datos : [];
      } catch (e) { return []; }
    },
    // Guarda y avisa al resto de la página que el carrito cambió (ver "carrito:cambio").
    // El try/catch evita que falle si el navegador bloquea localStorage (modo privado).
    guardar: function (items) {
      try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch (e) { /* modo privado */ }
      document.dispatchEvent(new CustomEvent('carrito:cambio', { detail: items }));
    },
    // Agrega una excursión; si ya estaba, suma personas (tope MAX_PERSONAS).
    agregar: function (item, personas) {
      var items = this.cargar();
      var existente = items.filter(function (i) { return i.id === item.id; })[0];
      personas = personas || 1;
      if (existente) {
        existente.personas = Math.min(MAX_PERSONAS, existente.personas + personas);
      } else {
        items.push({
          id: item.id, nombre: item.nombre, precio: item.precio,
          imagen: item.imagen || '', lugar: item.lugar || '',
          personas: Math.min(MAX_PERSONAS, personas)
        });
      }
      this.guardar(items);
    },
    // Cambia la cantidad de personas de un ítem, siempre entre 1 y MAX_PERSONAS.
    cambiarPersonas: function (id, personas) {
      var items = this.cargar();
      items.forEach(function (i) {
        if (i.id === id) i.personas = Math.max(1, Math.min(MAX_PERSONAS, personas));
      });
      this.guardar(items);
    },
    quitar: function (id) {
      this.guardar(this.cargar().filter(function (i) { return i.id !== id; }));
    },
    vaciar: function () { this.guardar([]); },
    // Total de PERSONAS (no de excursiones): es el número del globito rojo del navbar.
    cantidad: function () {
      return this.cargar().reduce(function (a, i) { return a + i.personas; }, 0);
    },
    // Importe total: suma de precio × personas de cada ítem.
    total: function () {
      return this.cargar().reduce(function (a, i) { return a + i.precio * i.personas; }, 0);
    }
  };
  // Se expone globalmente para que checkout.js (y la consola) puedan usarlo.
  window.Carrito = Carrito;

  // ---------- estilos (se carga solo, no hace falta tocar los HTML) ----------
  (function cargarCss() {
    var script = document.currentScript;
    var base = script ? script.src.replace(/js\/carrito\.js.*$/, '') : '';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'css/carrito.css';
    document.head.appendChild(link);
  })();

  // ---------- vistas ----------
  function filaPanel(i) {
    return '<li class="cart-item" data-id="' + esc(i.id) + '">' +
      '<div class="cart-item-img" style="background-image:url(\'' + esc(i.imagen) + '\')"></div>' +
      '<div class="cart-item-info">' +
        '<strong>' + esc(i.nombre) + '</strong>' +
        '<small>' + dinero(i.precio) + ' por persona</small>' +
        '<div class="cart-qty">' +
          '<button type="button" data-accion="menos" aria-label="Menos personas">&minus;</button>' +
          '<span>' + i.personas + '</span>' +
          '<button type="button" data-accion="mas" aria-label="Más personas">+</button>' +
        '</div>' +
      '</div>' +
      '<div class="cart-item-side">' +
        '<span class="cart-item-total">' + dinero(i.precio * i.personas) + '</span>' +
        '<button type="button" class="cart-remove" data-accion="quitar" aria-label="Quitar">&times;</button>' +
      '</div></li>';
  }

  function vistaVacia() {
    return '<div class="cart-empty"><svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">' +
      '<path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM1 2v2h2l3.6 7.6-1.4 2.4A2 2 0 0 0 7 17h12v-2H7.4l1.1-2h7.5a2 2 0 0 0 1.8-1.1l3.6-6.5A1 1 0 0 0 20.5 4H5.2l-.9-2H1z"/></svg>' +
      '<p>Tu carrito está vacío</p><a href="tour.html" class="btn btn-primary py-2 px-4">Ver excursiones</a></div>';
  }

  // ---------- panel lateral + botón ----------
  var panel, fondo, badge, toastEl, toastTimer;

  // Crea los elementos del carrito y los inserta en la página:
  // botón en el navbar, fondo oscuro, panel lateral y aviso (toast).
  // Los textos de los botones/títulos del panel se cambian acá.
  function construirUI() {
    var lista = document.querySelector('#ftco-nav .navbar-nav');
    var boton = el(
      '<li class="nav-item cart-nav-item"><a href="carrito.html" class="nav-link cart-btn" aria-label="Abrir carrito">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM1 2v2h2l3.6 7.6-1.4 2.4A2 2 0 0 0 7 17h12v-2H7.4l1.1-2h7.5a2 2 0 0 0 1.8-1.1l3.6-6.5A1 1 0 0 0 20.5 4H5.2l-.9-2H1z"/></svg>' +
      '<span class="cart-badge" hidden>0</span></a></li>');
    if (lista) lista.appendChild(boton);
    badge = boton.querySelector('.cart-badge');

    // En la página del carrito el botón lleva directo; en el resto abre el panel
    if (!document.getElementById('carrito-pagina')) {
      boton.querySelector('a').addEventListener('click', function (e) { e.preventDefault(); abrirPanel(); });
    }

    fondo = el('<div class="cart-overlay"></div>');
    panel = el(
      '<aside class="cart-panel" aria-label="Carrito" aria-hidden="true">' +
        '<header><h3>Tu carrito</h3><button type="button" class="cart-close" aria-label="Cerrar">&times;</button></header>' +
        '<div class="cart-body"></div>' +
        '<footer></footer>' +
      '</aside>');
    toastEl = el('<div class="cart-toast" role="status"></div>');
    document.body.appendChild(fondo);
    document.body.appendChild(panel);
    document.body.appendChild(toastEl);

    fondo.addEventListener('click', cerrarPanel);
    panel.querySelector('.cart-close').addEventListener('click', cerrarPanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarPanel(); });
    panel.addEventListener('click', accionesLista);
  }

  function abrirPanel() {
    panel.classList.add('open'); fondo.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-lock');
  }
  function cerrarPanel() {
    panel.classList.remove('open'); fondo.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-lock');
  }

  function aviso(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function pintarPanel() {
    var items = Carrito.cargar();
    var cuerpo = panel.querySelector('.cart-body');
    var pie = panel.querySelector('footer');
    if (!items.length) {
      cuerpo.innerHTML = vistaVacia();
      pie.innerHTML = '';
      return;
    }
    cuerpo.innerHTML = '<ul class="cart-list">' + items.map(filaPanel).join('') + '</ul>';
    pie.innerHTML =
      '<div class="cart-total"><span>Total</span><strong>' + dinero(Carrito.total()) + '</strong></div>' +
      '<a href="carrito.html" class="btn btn-primary btn-block py-3">Ver carrito y pagar</a>';
  }

  function pintarBadge() {
    var n = Carrito.cantidad();
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  // Maneja los botones + / − / × de una fila. Usa "delegación de eventos":
  // un solo listener en la lista, que mira qué botón (data-accion) se tocó y
  // de qué fila (data-id). Así funciona aunque las filas se vuelvan a dibujar.
  // Se comparte entre el panel lateral y la página carrito.html.
  function accionesLista(e) {
    var btn = e.target.closest('[data-accion]');
    if (!btn) return;
    var fila = btn.closest('[data-id]');
    if (!fila) return;
    var id = fila.getAttribute('data-id');
    var item = Carrito.cargar().filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    var a = btn.getAttribute('data-accion');
    if (a === 'mas') Carrito.cambiarPersonas(id, item.personas + 1);
    else if (a === 'menos') Carrito.cambiarPersonas(id, item.personas - 1);
    else if (a === 'quitar') Carrito.quitar(id);
  }

  // ---------- agregar desde las tarjetas ----------
  // Convierte "$25.000" o "$200" en el número 25000 / 200 (quita todo lo que no es dígito).
  function leerPrecio(txt) {
    var n = parseInt(String(txt).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  // Recorre las tarjetas .destination de tour.html y les agrega el botón.
  // Los datos (nombre, precio, imagen, lugar) se LEEN de lo que ya está escrito
  // en la tarjeta, así no hay que tocar el HTML de cada una. El id sale del
  // nombre ("Kitesurf, Italia" -> "kitesurf-italia"): si dos tarjetas tuvieran el
  // mismo nombre se mezclarían, así que cada excursión debe tener nombre único.
  // Solo corre en tour.html; en otras páginas usar botones data-cart-add.
  function mejorarTarjetas() {
    if (!/tour\.html$/.test(location.pathname)) return;
    document.querySelectorAll('.destination').forEach(function (card) {
      var precio = card.querySelector('.price');
      var titulo = card.querySelector('h3');
      if (!precio || !titulo || card.querySelector('.cart-add')) return;

      var img = card.querySelector('.img');
      var bg = img ? (img.getAttribute('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/) : null;
      var lugar = card.querySelector('.bottom-area span');
      var datos = {
        id: slug(titulo.textContent),
        nombre: titulo.textContent.trim(),
        precio: leerPrecio(precio.textContent),
        imagen: bg ? bg[1] : '',
        lugar: lugar ? lugar.textContent.trim() : ''
      };

      var b = el('<button type="button" class="btn btn-primary btn-block cart-add mt-2">Agregar al carrito</button>');
      b.addEventListener('click', function () {
        Carrito.agregar(datos, 1);
        aviso(datos.nombre + ' se agregó al carrito');
        b.classList.add('added');
        setTimeout(function () { b.classList.remove('added'); }, 600);
      });
      card.querySelector('.text').appendChild(b);
    });
  }

  // API declarativa: <button data-cart-add="id" data-nombre=".." data-precio="..">
  function botonesDeclarativos() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cart-add]');
      if (!b) return;
      e.preventDefault();
      Carrito.agregar({
        id: b.getAttribute('data-cart-add'),
        nombre: b.getAttribute('data-nombre') || 'Excursión',
        precio: leerPrecio(b.getAttribute('data-precio')),
        imagen: b.getAttribute('data-imagen') || '',
        lugar: b.getAttribute('data-lugar') || ''
      }, parseInt(b.getAttribute('data-personas'), 10) || 1);
      aviso((b.getAttribute('data-nombre') || 'Excursión') + ' se agregó al carrito');
    });
  }

  // ---------- página carrito.html ----------
  // Dibuja el contenido de carrito.html dentro de <div id="carrito-pagina">.
  // Si esa página no existe en el HTML actual, no hace nada.
  function pintarPagina() {
    var raiz = document.getElementById('carrito-pagina');
    if (!raiz) return;
    var items = Carrito.cargar();
    if (!items.length) {
      raiz.innerHTML = vistaVacia();
      return;
    }
    var filas = items.map(function (i) {
      return '<li class="cart-item" data-id="' + esc(i.id) + '">' +
        '<div class="cart-item-img" style="background-image:url(\'' + esc(i.imagen) + '\')"></div>' +
        '<div class="cart-item-info"><strong>' + esc(i.nombre) + '</strong>' +
        (i.lugar ? '<small>' + esc(i.lugar) + '</small>' : '') +
        '<small>' + dinero(i.precio) + ' por persona</small></div>' +
        '<div class="cart-qty">' +
          '<button type="button" data-accion="menos" aria-label="Menos personas">&minus;</button>' +
          '<span>' + i.personas + (i.personas === 1 ? ' persona' : ' personas') + '</span>' +
          '<button type="button" data-accion="mas" aria-label="Más personas">+</button>' +
        '</div>' +
        '<div class="cart-item-side"><span class="cart-item-total">' + dinero(i.precio * i.personas) + '</span>' +
        '<button type="button" class="cart-remove" data-accion="quitar" aria-label="Quitar">&times;</button></div></li>';
    }).join('');

    raiz.innerHTML =
      '<div class="row">' +
        '<div class="col-lg-8"><ul class="cart-list cart-list-page">' + filas + '</ul>' +
          '<div class="mt-3 d-flex justify-content-between">' +
            '<a href="tour.html" class="btn btn-outline-secondary px-4">&larr; Seguir explorando</a>' +
            '<button type="button" id="cart-vaciar" class="btn btn-link text-danger">Vaciar carrito</button>' +
          '</div></div>' +
        '<div class="col-lg-4"><div class="cart-summary">' +
          '<h4>Resumen</h4>' +
          '<div class="cart-row"><span>Excursiones</span><span>' + items.length + '</span></div>' +
          '<div class="cart-row"><span>Personas</span><span>' + Carrito.cantidad() + '</span></div>' +
          '<hr><div class="cart-row cart-row-total"><span>Total</span><strong>' + dinero(Carrito.total()) + '</strong></div>' +
          '<a href="checkout.html" id="cart-pagar" class="btn btn-primary btn-block py-3 mt-3">Continuar al pago</a>' +
        '</div></div>' +
      '</div>';

    raiz.querySelector('.cart-list').addEventListener('click', accionesLista);
    raiz.querySelector('#cart-vaciar').addEventListener('click', function () {
      if (confirm('¿Vaciar todo el carrito?')) Carrito.vaciar();
    });
  }

  // ---------- init ----------
  function refrescar() { pintarBadge(); pintarPanel(); pintarPagina(); }

  // Punto de entrada: arma la interfaz, engancha los botones y pinta el estado actual.
  // El evento "storage" mantiene sincronizadas varias pestañas abiertas a la vez.
  function init() {
    construirUI();
    mejorarTarjetas();
    botonesDeclarativos();
    document.addEventListener('carrito:cambio', refrescar);
    window.addEventListener('storage', function (e) { if (e.key === CLAVE) refrescar(); }); // otras pestañas
    refrescar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
