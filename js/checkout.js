/*
 * Checkout de Vertigo con pasarela de pago SIMULADA (solo front).
 *
 * QUÉ HACE
 * - Valida el número con el algoritmo de Luhn, la marca, el vencimiento y el CVV.
 * - Simula el cobro (espera ~2 s y aprueba o rechaza según el final de la tarjeta).
 * - Nunca guarda el número completo ni el CVV: solo marca y últimos 4 dígitos.
 * - Exige tener sesión iniciada: si no hay, manda a login.html y vuelve acá al ingresar.
 * - El pedido se guarda con Datos.crearPedido() (js/datos.js): crea pedido + items + pago
 *   a nombre del usuario logueado, y aparece enseguida en el panel de administración.
 *   El total se recalcula con los precios de la tabla excursiones, no con los del carrito.
 * Depende de js/datos.js, js/sesion.js y js/carrito.js (window.Carrito).
 *
 * FLUJO
 *   pintarFormulario() -> el usuario completa -> enviar() -> validar()
 *   -> procesar() (pago simulado) -> si aprueba: crearPedido() + vaciar carrito
 *   -> pintarConfirmacion() ; si rechaza: muestra el motivo y deja reintentar.
 *
 * CUANDO HAYA BACKEND
 *   - procesar(): reemplazar por fetch('pagar.php') que valide y devuelva {ok, motivo}.
 *   - crearPedido(): reemplazar por un INSERT en pedidos, pedido_items y pagos (desde PHP).
 *   - validar() se puede dejar igual como validación rápida del lado del navegador,
 *     pero PHP TIENE que volver a validar todo (el navegador se puede manipular).
 *
 * TESTS: tarjetas que terminan en 0002 o 9995 se rechazan; el resto válido aprueba.
 */
(function () {
  'use strict';

  var usuario = null;   // usuario logueado (fila de la tabla usuarios)
  var fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- validaciones de tarjeta ----------
  // Algoritmo de Luhn (el que usan las tarjetas reales para detectar errores de tipeo):
  //  1) recorrer los dígitos de DERECHA a IZQUIERDA;
  //  2) duplicar uno de cada dos (el 2.º, 4.º, 6.º... desde la derecha);
  //  3) si el doble supera 9, restarle 9 (equivale a sumar sus dos cifras);
  //  4) sumar todo: el número es válido si la suma es múltiplo de 10.
  // OJO: solo comprueba el formato, no que la tarjeta exista ni tenga fondos.
  function luhn(num) {
    var suma = 0, doble = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var d = parseInt(num.charAt(i), 10);
      if (doble) { d *= 2; if (d > 9) d -= 9; }
      suma += d;
      doble = !doble;
    }
    return suma % 10 === 0;
  }

  // Detecta la marca por los primeros dígitos (el "BIN"):
  // Visa empieza con 4; Mastercard con 51-55 o 22-27; American Express con 34 o 37.
  function marca(num) {
    if (/^4/.test(num)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(num)) return 'Mastercard';
    if (/^3[47]/.test(num)) return 'American Express';
    return '';
  }

  // Acepta "MM/AA". La tarjeta sirve hasta el FINAL del mes de vencimiento,
  // por eso se compara con el mes actual y no con el día de hoy.
  function vencimientoValido(txt) {
    var m = /^(\d{2})\/(\d{2})$/.exec(txt);
    if (!m) return false;
    var mes = parseInt(m[1], 10), anio = 2000 + parseInt(m[2], 10);
    if (mes < 1 || mes > 12) return false;
    var hoy = new Date();
    // vale hasta el último día del mes de vencimiento
    return anio > hoy.getFullYear() || (anio === hoy.getFullYear() && mes >= hoy.getMonth() + 1);
  }

  var soloDigitos = function (s) { return String(s).replace(/\D/g, ''); };

  // ---------- vistas ----------
  var raiz;

  // HTML de la lista de excursiones del pedido (se usa en el checkout y en el comprobante).
  function resumen(items) {
    return '<ul class="cart-list co-items">' + items.map(function (i) {
      return '<li class="cart-item">' +
        '<div class="cart-item-img" style="background-image:url(\'' + esc(i.imagen) + '\')"></div>' +
        '<div class="cart-item-info"><strong>' + esc(i.nombre) + '</strong>' +
        '<small>' + i.personas + (i.personas === 1 ? ' persona' : ' personas') + ' × ' + fmt.format(i.precio) + '</small></div>' +
        '<div class="cart-item-side"><span class="cart-item-total">' + fmt.format(i.precio * i.personas) + '</span></div></li>';
    }).join('') + '</ul>';
  }

  // Dibuja el formulario completo dentro de <div id="checkout-pagina"> y engancha
  // los eventos. Si el carrito está vacío muestra un aviso en vez del formulario.
  // Para agregar un campo nuevo: usar campo(...) acá y validarlo en validar().
  function pintarFormulario() {
    var items = window.Carrito.cargar();
    if (!items.length) {
      raiz.innerHTML = '<div class="cart-empty"><p>No tenés nada para pagar todavía</p>' +
        '<a href="tour.html" class="btn btn-primary py-2 px-4">Ver excursiones</a></div>';
      return;
    }
    raiz.innerHTML =
      '<div class="row">' +
        '<div class="col-lg-7 mb-4">' +
          '<form id="co-form" novalidate>' +
            '<div class="co-card"><h4>1. Tus datos</h4>' +
              '<div class="form-row">' +
                campo('nombre', 'Nombre y apellido', 'text', 'col-md-6', 'name') +
                campo('email', 'Email', 'email', 'col-md-6', 'email') +
              '</div>' +
              '<div class="form-row">' + campo('dni', 'DNI', 'text', 'col-md-6', 'off', '12345678') + '</div>' +
            '</div>' +
            '<div class="co-card"><h4>2. Pago con tarjeta <span class="co-brand" id="co-marca"></span></h4>' +
              '<div class="form-row">' + campo('numero', 'Número de tarjeta', 'text', 'col-12', 'off', '0000 0000 0000 0000', 'numeric') + '</div>' +
              '<div class="form-row">' + campo('titular', 'Titular (como figura en la tarjeta)', 'text', 'col-12', 'off') + '</div>' +
              '<div class="form-row">' +
                campo('venc', 'Vencimiento', 'text', 'col-6', 'off', 'MM/AA', 'numeric') +
                campo('cvv', 'CVV', 'password', 'col-6', 'off', '•••', 'numeric') +
              '</div>' +
              '<div id="co-error" class="co-alert" hidden></div>' +
            '</div>' +
            '<button type="submit" id="co-pagar" class="btn btn-primary btn-block py-3">Pagar</button>' +
          '</form>' +
        '</div>' +
        '<div class="col-lg-5"><div class="cart-summary"><h4>Tu pedido</h4>' + resumen(items) +
          '<hr><div class="cart-row cart-row-total"><span>Total</span><strong id="co-total">' + fmt.format(window.Carrito.total()) + '</strong></div>' +
          '<a href="carrito.html" class="small">Modificar carrito</a></div></div>' +
      '</div>';

    var f = $('#co-form');
    f.addEventListener('submit', enviar);
    f.addEventListener('input', function (e) { limpiarError(e.target); });
    $('#numero').addEventListener('input', formatearNumero);
    $('#venc').addEventListener('input', formatearVenc);
    $('#cvv').addEventListener('input', function (e) { e.target.value = soloDigitos(e.target.value).slice(0, 4); });
  }

  // Genera el HTML de un campo (etiqueta + input + lugar para el error).
  // col = clase de columna de Bootstrap; auto = valor de autocomplete; modo = inputmode (teclado en celular).
  function campo(id, etiqueta, tipo, col, auto, placeholder, modo) {
    return '<div class="form-group ' + col + '"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input type="' + tipo + '" id="' + id + '" class="form-control" autocomplete="' + (auto || 'off') + '"' +
      (placeholder ? ' placeholder="' + placeholder + '"' : '') +
      (modo ? ' inputmode="' + modo + '"' : '') + '>' +
      '<div class="invalid-feedback"></div></div>';
  }

  // Mientras se escribe: deja solo dígitos, agrupa de a 4 (Amex: 4-6-5) y muestra la marca.
  function formatearNumero(e) {
    var n = soloDigitos(e.target.value).slice(0, 16);
    var m = marca(n);
    if (m === 'American Express') {
      n = n.slice(0, 15);
      e.target.value = n.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, function (_, a, b, c) {
        return [a, b, c].filter(Boolean).join(' ');
      });
    } else {
      e.target.value = n.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
    $('#co-marca').textContent = m;
  }

  function formatearVenc(e) {
    var n = soloDigitos(e.target.value).slice(0, 4);
    e.target.value = n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
  }

  // ---------- errores ----------
  function errorCampo(id, msg) {
    var inp = $('#' + id);
    inp.classList.add('is-invalid');
    inp.parentNode.querySelector('.invalid-feedback').textContent = msg;
  }
  function limpiarError(inp) {
    if (inp && inp.classList) inp.classList.remove('is-invalid');
    var a = $('#co-error');
    if (a) a.hidden = true;
  }

  // Revisa todos los campos y marca los errores. Devuelve true solo si todo está bien.
  // Se revisan TODOS (no se corta en el primero) para que el usuario vea cada error a la vez.
  function validar() {
    var ok = true;
    function falla(id, msg) { errorCampo(id, msg); ok = false; }

    if ($('#nombre').value.trim().length < 3) falla('nombre', 'Ingresá tu nombre completo');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#email').value.trim())) falla('email', 'Ingresá un email válido');
    if (!/^\d{7,8}$/.test(soloDigitos($('#dni').value))) falla('dni', 'El DNI debe tener 7 u 8 números');

    var num = soloDigitos($('#numero').value);
    var m = marca(num);
    if (!m) falla('numero', 'Solo aceptamos Visa, Mastercard o American Express');
    else if (num.length !== (m === 'American Express' ? 15 : 16) || !luhn(num)) falla('numero', 'El número de tarjeta no es válido');

    if ($('#titular').value.trim().length < 3) falla('titular', 'Ingresá el nombre del titular');
    if (!vencimientoValido($('#venc').value)) falla('venc', 'Vencimiento inválido o vencido');
    var largoCvv = m === 'American Express' ? 4 : 3;
    if (soloDigitos($('#cvv').value).length !== largoCvv) falla('cvv', 'El CVV tiene ' + largoCvv + ' dígitos');
    return ok;
  }

  // ---------- pago simulado ----------
  // SIMULA la pasarela de pago. Devuelve una Promesa (como lo haría un fetch real)
  // que a los 2,2 s responde {ok:true} o {ok:false, motivo}. Es lo único "falso"
  // del checkout: la decisión se toma por los últimos dígitos de la tarjeta.
  function procesar(num) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (/0002$/.test(num)) resolve({ ok: false, motivo: 'Tarjeta rechazada: fondos insuficientes.' });
        else if (/9995$/.test(num)) resolve({ ok: false, motivo: 'Tarjeta rechazada: el banco emisor no autorizó la operación.' });
        else resolve({ ok: true });
      }, 2200);
    });
  }

  // Al apretar "Pagar": valida; si está bien, bloquea el botón (evita doble cobro),
  // espera a procesar() y según el resultado confirma el pedido o muestra el error.
  function enviar(e) {
    e.preventDefault();
    if (!validar()) {
      var primero = $('.is-invalid');
      if (primero) primero.focus();
      return;
    }
    var num = soloDigitos($('#numero').value);
    var btn = $('#co-pagar');
    btn.disabled = true;
    btn.innerHTML = '<span class="co-spinner"></span> Procesando pago…';

    procesar(num).then(function (r) {
      if (!r.ok) {
        btn.disabled = false;
        btn.textContent = 'Pagar';
        var a = $('#co-error');
        a.textContent = r.motivo + ' Probá con otra tarjeta.';
        a.hidden = false;
        return;
      }
      var items = window.Carrito.cargar();
      var pedido;
      try {
        // Cada ítem del carrito se asocia a su excursión de la base por el nombre (id del carrito)
        var lineas = items.map(function (i) {
          var ex = Datos.excursionPorSlug(i.id);
          if (!ex) throw new Error('La excursión "' + i.nombre + '" ya no está disponible.');
          return { excursion_id: ex.id, personas: i.personas };
        });
        pedido = Datos.crearPedido({
          usuario_id: usuario.id,
          estado_id: Datos.ESTADO.PAGADA,
          items: lineas,
          pago: { marca: marca(num), ultimos4: num.slice(-4) }   // nunca el número completo ni el CVV
        });
      } catch (err) {
        // Sin lugares, excursión dada de baja, etc.: se avisa y se deja reintentar
        btn.disabled = false;
        btn.textContent = 'Pagar';
        var al = $('#co-error');
        al.textContent = err.message;
        al.hidden = false;
        return;
      }
      window.Carrito.vaciar();
      pintarConfirmacion({
        codigo: pedido.codigo, total: pedido.total, items: items,
        cliente: { nombre: usuario.nombre + ' ' + usuario.apellido, email: usuario.email },
        pago: { marca: marca(num), ultimos4: num.slice(-4) }
      });
    });
  }

  // Pantalla de "¡Pago aprobado!" con el comprobante (reemplaza al formulario).
  function pintarConfirmacion(p) {
    window.scrollTo(0, 0);
    raiz.innerHTML =
      '<div class="co-ok">' +
        '<div class="co-check"><svg viewBox="0 0 24 24" width="40" height="40"><path fill="none" stroke="#fff" stroke-width="3" d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
        '<h2>¡Pago aprobado!</h2>' +
        '<p>Gracias, ' + esc(p.cliente.nombre.split(' ')[0]) + '. Te enviamos la confirmación a <strong>' + esc(p.cliente.email) + '</strong>.</p>' +
        '<div class="cart-summary co-recibo">' +
          '<div class="cart-row"><span>N.º de reserva</span><strong>' + esc(p.codigo) + '</strong></div>' +
          '<div class="cart-row"><span>Pagado con</span><span>' + esc(p.pago.marca) + ' ···· ' + esc(p.pago.ultimos4) + '</span></div>' +
          '<hr>' + resumen(p.items) +
          '<hr><div class="cart-row cart-row-total"><span>Total pagado</span><strong>' + fmt.format(p.total) + '</strong></div>' +
        '</div>' +
        '<a href="tour.html" class="btn btn-primary py-3 px-5 mt-4">Seguir explorando</a> ' +
        '<button type="button" class="btn btn-outline-secondary py-3 px-4 mt-4" onclick="window.print()">Imprimir comprobante</button>' +
      '</div>';
  }

  // Completa "Tus datos" con los de la cuenta (si el carrito está vacío no hay formulario)
  function prellenarDatos() {
    if (!$('#co-form')) return;
    $('#nombre').value = usuario.nombre + ' ' + usuario.apellido;
    $('#email').value = usuario.email;
    $('#dni').value = usuario.dni || '';
  }

  function init() {
    raiz = document.getElementById('checkout-pagina');
    if (!raiz || !window.Carrito) return;
    // Para pagar hay que tener cuenta: si no hay sesión, va a login.html y vuelve acá
    usuario = window.SesionSitio && SesionSitio.exigirLogin();
    if (!usuario) return;
    pintarFormulario();
    prellenarDatos();
    // si cambian el carrito desde el panel lateral, se actualiza el resumen (sin pisar lo que escribió)
    document.addEventListener('carrito:cambio', function () {
      if (!$('#co-form')) return;
      var items = window.Carrito.cargar();
      if (!items.length) { pintarFormulario(); return; }
      $('.co-items').outerHTML = resumen(items);
      $('#co-total').textContent = fmt.format(window.Carrito.total());
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
