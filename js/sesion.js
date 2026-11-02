/*
 * DOCUMENTACIÓN - sesion.js (menú de usuario en el navbar del sitio)
 *
 * Se carga en todas las páginas públicas (después de datos.js). Agrega al menú:
 *   - sin sesión:  el enlace "Ingresar" (lleva a login.html)
 *   - con sesión:  "Hola, <nombre>" con un menú: Mis reservas, (Panel de administración
 *                  si es admin) y Salir.
 * También ofrece SesionSitio.exigirLogin() para páginas que solo pueden ver usuarios
 * registrados (la usa el checkout).
 */
(function () {
  'use strict';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Si no hay sesión, manda a login.html y recuerda a qué página volver
  window.SesionSitio = {
    exigirLogin: function () {
      var u = Datos.sesion();
      if (!u) {
        var pagina = location.pathname.split('/').pop() || 'index.html';
        location.replace('login.html?volver=' + encodeURIComponent(pagina));
      }
      return u;
    }
  };

  function construir() {
    var lista = document.querySelector('#ftco-nav .navbar-nav');
    if (!lista) return;
    var u = Datos.sesion();
    var li = document.createElement('li');

    if (!u) {
      li.className = 'nav-item';
      li.innerHTML = '<a href="login.html" class="nav-link">Ingresar</a>';
    } else {
      li.className = 'nav-item dropdown';
      li.innerHTML =
        '<a href="#" class="nav-link dropdown-toggle" id="menu-usuario" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">Hola, ' + esc(u.nombre) + '</a>' +
        '<div class="dropdown-menu dropdown-menu-right" aria-labelledby="menu-usuario">' +
          '<a class="dropdown-item" href="mis-reservas.html">Mis reservas</a>' +
          (Datos.esAdmin(u) ? '<a class="dropdown-item" href="dashboard/index.html">Panel de administración</a>' : '') +
          '<div class="dropdown-divider"></div>' +
          '<a class="dropdown-item" href="#" id="salir-sesion">Salir</a>' +
        '</div>';
    }
    // Va antes del botón del carrito (si ya existe) para que el carrito quede al final
    var carrito = lista.querySelector('.cart-nav-item');
    lista.insertBefore(li, carrito);

    var salir = li.querySelector('#salir-sesion');
    if (salir) salir.addEventListener('click', function (e) {
      e.preventDefault(); Datos.cerrarSesion(); location.href = 'index.html';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construir);
  else construir();
})();
