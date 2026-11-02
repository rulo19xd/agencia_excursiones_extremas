/*
 * DOCUMENTACIÓN - layout.js (estructura común del panel de administración)
 *
 * Todas las páginas del panel (index, excursiones, pedidos, usuarios, catalogos) cargan este
 * archivo en el <head>. Hace tres cosas:
 *
 * 1) GUARDIA DE ACCESO: si no hay sesión o el usuario NO es administrador, redirige a
 *    login.html del sitio (../login.html). Se ejecuta antes de dibujar la página, así que un cliente nunca ve el panel.
 *    (Con backend, esta verificación la hace PHP en el servidor con $_SESSION; el chequeo de
 *    acá es solo comodidad, no seguridad real.)
 * 2) ARMA EL MARCO: barra lateral (menú), barra superior, título de la página y pie. Cada
 *    página solo escribe su contenido dentro de <div id="contenido">; el marco se agrega solo.
 *    La página indica su título con atributos del <body>:
 *        data-pagina="excursiones"   -> cuál ítem del menú se marca como activo
 *        data-titulo="Excursiones"   -> título grande
 *        data-subtitulo="..."        -> texto debajo del título
 *    Si la página tiene un <div id="acciones">, se muestra a la derecha del título (botones).
 * 3) Maneja el botón de menú del celular, el de minimizar y el de cerrar sesión.
 *
 * PARA AGREGAR UNA PANTALLA NUEVA AL MENÚ: sumar una línea en el arreglo MENU de abajo
 * y crear el .html copiando el esqueleto de otra página del panel.
 */
(function () {
  'use strict';

  // El login está en la raíz del sitio, una carpeta más arriba (../login.html). El panel
  // vive en la subcarpeta dashboard/ del sitio y comparte datos.js con él.
  var SITIO = '../';
  var PAGINA_LOGIN = SITIO + 'login.html';
  var u = window.Datos && Datos.sesion();
  if (!u || !Datos.esAdmin(u)) { location.replace(PAGINA_LOGIN); return; }

  // Menú lateral: [id de página, texto, archivo, ícono de Bootstrap Icons]
  var MENU = [
    ['Principal', [
      ['index', 'Resumen', 'index.html', 'bi-grid-fill']
    ]],
    ['Gestión', [
      ['excursiones', 'Excursiones', 'excursiones.html', 'bi-compass'],
      ['pedidos', 'Reservas', 'pedidos.html', 'bi-receipt'],
      ['usuarios', 'Usuarios', 'usuarios.html', 'bi-people']
    ]],
    ['Configuración', [
      ['catalogos', 'Tipos y lugares', 'catalogos.html', 'bi-geo-alt']
    ]],
    ['Sitio', [
      ['sitio', 'Ver el sitio web', SITIO + 'index.html', 'bi-box-arrow-up-right']
    ]]
  ];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function sidebar(activa) {
    var grupos = MENU.map(function (g) {
      return '<div class="sidebar-menu-section"><div class="sidebar-menu-title">' + g[0] + '</div><ul class="sidebar-menu-list">' +
        g[1].map(function (m) {
          return '<li class="sidebar-menu-item"><a href="' + m[2] + '" class="sidebar-menu-link' + (m[0] === activa ? ' active' : '') + '" title="' + m[1] + '">' +
            '<i class="bi ' + m[3] + '"></i><span>' + m[1] + '</span></a></li>';
        }).join('') + '</ul></div>';
    }).join('');
    return '<div class="sidebar-wrapper" id="sidebar">' +
      '<a href="index.html" class="sidebar-brand"><i class="bi bi-asterisk"></i><span>Vertigo</span></a>' +
      '<div class="flex-grow-1 overflow-y-auto">' + grupos + '</div>' +
      '<div class="sidebar-profile"><img src="assets/images/avatar.png" alt="" class="sidebar-profile-img">' +
      '<div class="sidebar-profile-info"><div class="sidebar-profile-name">' + esc(u.nombre + ' ' + u.apellido) + '</div>' +
      '<div class="sidebar-profile-email">' + esc(u.email) + '</div></div></div></div>';
  }

  function barraSuperior() {
    return '<header class="navbar-custom"><div class="navbar-left">' +
      '<button class="btn-desktop-toggle d-none d-xl-flex align-items-center justify-content-center me-3" id="desktop-sidebar-toggle" aria-label="Minimizar menú"><i class="bi bi-chevron-bar-left"></i></button>' +
      '<button class="sidebar-toggle-btn me-2" id="sidebar-toggle" aria-label="Abrir menú"><i class="bi bi-list"></i></button>' +
      '<div class="dropdown ms-2"><button class="btn-quick-action dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-plus-lg"></i><span>Crear</span></button>' +
      '<ul class="dropdown-menu dropdown-menu-quick-action"><li class="dropdown-header">Accesos rápidos</li>' +
      '<li><a class="dropdown-item" href="excursiones.html?nueva=1"><i class="bi bi-compass"></i> Nueva excursión</a></li>' +
      '<li><a class="dropdown-item" href="pedidos.html?nueva=1"><i class="bi bi-receipt"></i> Nueva reserva</a></li>' +
      '<li><a class="dropdown-item" href="usuarios.html?nueva=1"><i class="bi bi-person-plus"></i> Nuevo usuario</a></li></ul></div></div>' +
      '<div class="navbar-actions"><div class="dropdown ms-2">' +
      '<button class="navbar-profile-btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">' +
      '<img src="assets/images/avatar.png" alt="" class="navbar-profile-img"><span class="navbar-profile-name d-none d-md-inline">' + esc(u.nombre) + '</span><i class="bi bi-chevron-down navbar-profile-caret"></i></button>' +
      '<ul class="dropdown-menu dropdown-menu-end dropdown-menu-profile"><li class="dropdown-header">Administrador</li>' +
      '<li><a class="dropdown-item" href="' + SITIO + 'index.html"><i class="bi bi-house"></i> Ver el sitio</a></li><li><hr class="dropdown-divider"></li>' +
      '<li><a class="dropdown-item text-danger" href="#" id="btn-salir"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</a></li></ul></div></div></header>';
  }

  function armar() {
    var body = document.body;
    var contenido = document.getElementById('contenido');
    var acciones = document.getElementById('acciones');
    var activa = body.getAttribute('data-pagina') || '';
    var titulo = body.getAttribute('data-titulo') || '';
    var sub = body.getAttribute('data-subtitulo') || '';

    var cabecera = '<div class="page-header"><div><h1 class="page-title">' + esc(titulo) + '</h1>' +
      (sub ? '<p class="page-subtitle">' + esc(sub) + '</p>' : '') + '</div><div id="acciones-destino"></div></div>';
    var pie = '<footer class="footer-custom"><div class="footer-left"><span class="footer-logo"><i class="bi bi-asterisk"></i> Vertigo</span>' +
      '<span class="footer-separator">|</span><span class="footer-copy">&copy; ' + new Date().getFullYear() + ' Vertigo. Panel de administración.</span></div></footer>';

    // Se arma el marco y luego se mueve el contenido de la página adentro
    body.insertAdjacentHTML('afterbegin', sidebar(activa) + '<div class="main-wrapper" id="marco">' + barraSuperior() + cabecera + '<div id="zona-contenido"></div>' + pie + '</div>');
    if (contenido) document.getElementById('zona-contenido').appendChild(contenido);
    if (acciones) document.getElementById('acciones-destino').appendChild(acciones);

    // Menú en celular (con capa oscura) y minimizar en escritorio
    var side = document.getElementById('sidebar');
    var capa = document.createElement('div'); capa.className = 'sidebar-overlay'; body.appendChild(capa);
    document.getElementById('sidebar-toggle').addEventListener('click', function (e) {
      e.stopPropagation(); side.classList.toggle('show'); capa.classList.toggle('show', side.classList.contains('show'));
    });
    capa.addEventListener('click', function () { side.classList.remove('show'); capa.classList.remove('show'); });
    document.getElementById('desktop-sidebar-toggle').addEventListener('click', function () {
      body.classList.toggle('sidebar-minimized');
      this.querySelector('i').className = body.classList.contains('sidebar-minimized') ? 'bi bi-chevron-bar-right' : 'bi bi-chevron-bar-left';
      setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 300);
    });
    document.getElementById('btn-salir').addEventListener('click', function (e) {
      e.preventDefault(); Datos.cerrarSesion(); location.href = PAGINA_LOGIN;
    });

    document.dispatchEvent(new CustomEvent('panel:listo'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
  else armar();
})();
