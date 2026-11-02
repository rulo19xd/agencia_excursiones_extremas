/*
 * DOCUMENTACIÓN - login.js (lógica de login.html)
 *
 * - Alterna entre "Ingresar" y "Crear cuenta".
 * - Ingresar: valida los campos, llama a Datos.login() y redirige según el ROL:
 *       administrador -> dashboard/index.html   (panel de administración)
 *       cliente       -> la página indicada en ?volver=... o index.html
 * - Crear cuenta: valida, llama a Datos.registrar() (siempre crea un CLIENTE),
 *   inicia sesión y redirige igual que arriba.
 * - Si ya hay una sesión abierta, redirige directo (un admin nunca ve el login).
 *
 * CUANDO HAYA BACKEND: Datos.login/registrar se reemplazan por fetch('login.php')
 * y fetch('registro.php'); el servidor devuelve el rol y esta pantalla redirige igual.
 */
(function () {
  'use strict';

  var PANEL_ADMIN = 'dashboard/index.html';   // a dónde va un administrador al ingresar
  var INICIO = 'index.html';               // a dónde va un cliente si no venía de otra página

  var $ = function (id) { return document.getElementById(id); };

  // Solo se permite volver a páginas .html del propio sitio (evita redirecciones a otros dominios)
  function destinoCliente() {
    var v = new URLSearchParams(location.search).get('volver') || '';
    return /^[a-z0-9_\-]+\.html$/i.test(v) ? v : INICIO;
  }

  function redirigir(usuario) {
    location.replace(Datos.esAdmin(usuario) ? PANEL_ADMIN : destinoCliente());
  }

  // Ya hay sesión: no tiene sentido mostrar el login
  var actual = Datos.sesion();
  if (actual) { redirigir(actual); return; }

  // ---------- pestañas ----------
  function mostrar(modo) {
    var ingresar = modo === 'ingresar';
    $('form-ingresar').hidden = !ingresar;
    $('form-crear').hidden = ingresar;
    $('tab-ingresar').classList.toggle('active', ingresar);
    $('tab-crear').classList.toggle('active', !ingresar);
    $('auth-sub').textContent = ingresar
      ? 'Ingresá a tu cuenta para reservar tus excursiones'
      : 'Creá tu cuenta y empezá a reservar';
  }
  $('tab-ingresar').addEventListener('click', function () { mostrar('ingresar'); });
  $('tab-crear').addEventListener('click', function () { mostrar('crear'); });

  // Ojito para ver la contraseña
  document.querySelectorAll('.auth-eye').forEach(function (b) {
    b.addEventListener('click', function () {
      var inp = $(b.getAttribute('data-ver'));
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  // ---------- validación ----------
  function error(inputId, msg) {
    var campo = $(inputId).closest('.auth-field');
    campo.classList.add('invalid');
    campo.querySelector('.auth-error').textContent = msg;
  }
  function limpiar(form) {
    form.querySelectorAll('.auth-field').forEach(function (c) { c.classList.remove('invalid'); c.querySelector('.auth-error').textContent = ''; });
    form.querySelectorAll('.auth-alert').forEach(function (a) { a.hidden = true; });
  }
  var emailOk = function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); };

  // ---------- ingresar ----------
  $('form-ingresar').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target; limpiar(f);
    var email = $('li-email').value.trim(), pass = $('li-pass').value, ok = true;
    if (!emailOk(email)) { error('li-email', 'Ingresá un email válido'); ok = false; }
    if (!pass) { error('li-pass', 'Ingresá tu contraseña'); ok = false; }
    if (!ok) return;

    var u = Datos.login(email, pass);
    if (!u) {
      $('li-alerta').textContent = 'Email o contraseña incorrectos.';
      $('li-alerta').hidden = false;
      return;
    }
    redirigir(u);
  });

  // ---------- crear cuenta ----------
  $('form-crear').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target; limpiar(f);
    var ok = true;
    if ($('cr-nombre').value.trim().length < 2) { error('cr-nombre', 'Obligatorio'); ok = false; }
    if ($('cr-apellido').value.trim().length < 2) { error('cr-apellido', 'Obligatorio'); ok = false; }
    if (!emailOk($('cr-email').value.trim())) { error('cr-email', 'Email inválido'); ok = false; }
    var dni = $('cr-dni').value.replace(/\D/g, '');
    if (dni && (dni.length < 7 || dni.length > 8)) { error('cr-dni', '7 u 8 números'); ok = false; }
    if ($('cr-pass').value.length < 4) { error('cr-pass', 'Mínimo 4 caracteres'); ok = false; }
    if (!ok) return;

    var r = Datos.registrar({
      nombre: $('cr-nombre').value.trim(), apellido: $('cr-apellido').value.trim(),
      email: $('cr-email').value, password: $('cr-pass').value,
      telefono: $('cr-tel').value.trim(), dni: dni
    });
    if (r.error) { $('cr-alerta').textContent = r.error; $('cr-alerta').hidden = false; return; }
    redirigir(Datos.login($('cr-email').value, $('cr-pass').value));
  });
})();
