/*
 * DOCUMENTACIÓN - admin.js (lógica de las pantallas del panel de administración)
 *
 * Contiene un módulo por pantalla. Cada página del panel carga este archivo y, cuando layout.js
 * termina de armar el marco (evento "panel:listo"), se ejecuta el módulo que corresponde al
 * atributo data-pagina del <body>:
 *
 *   index        Resumen: totales, gráfico de ingresos, últimas reservas, ocupación
 *   excursiones  Alta, edición, activar/desactivar y baja de excursiones
 *   pedidos      Reservas: listado, detalle, cambio de estado y alta a nombre de un cliente
 *   usuarios     Cuentas de clientes y administradores
 *   catalogos    Tablas de apoyo: tipos de excursión, países, provincias, ciudades
 *
 * ORGANIZACIÓN
 *   1. utilidades        formato de dinero y fechas, escape de HTML, avisos, modal, validación
 *   2. módulos           uno por pantalla (cada uno tiene su función pintar())
 *   3. arranque          elige el módulo según la página
 *
 * LOS DATOS vienen de js/datos.js (objeto Datos), que se conecta con la base MySQL a través
 * de los PHP de api/. El servidor valida cada cambio (permisos, precios, lugares); si lo
 * rechaza, datos.js muestra el motivo y la pantalla no muestra el aviso de "guardado".
 */
(function () {
  'use strict';

  // =====================================================================
  // 1. UTILIDADES
  // =====================================================================
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var yo = Datos.sesion();   // administrador logueado

  var fmtDinero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  var dinero = function (n) { return fmtDinero.format(n); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Fechas guardadas como ISO ("2026-11-02T10:30:00Z") o solo día ("2026-12-10")
  function fecha(v) {
    if (!v) return '-';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  // Las rutas de imagen se guardan relativas al sitio ("images/x.jpg"); desde dashboard/ hay que subir un nivel (../)
  function urlImagen(r) { return !r ? '' : (/^(https?:|data:)/.test(r) ? r : '../' + r); }

  // Aviso flotante abajo a la derecha
  function aviso(msg, tipo) {
    var cont = $('#avisos');
    if (!cont) { cont = document.createElement('div'); cont.id = 'avisos'; document.body.appendChild(cont); }
    var a = document.createElement('div');
    a.className = 'aviso' + (tipo === 'error' ? ' error' : '');
    a.textContent = msg; cont.appendChild(a);
    setTimeout(function () { a.remove(); }, 3200);
  }

  // Ventana modal de Bootstrap (se crea una vez por id y se reutiliza)
  function modal(id, tam) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'modal fade'; el.id = id; el.tabIndex = -1;
      el.innerHTML = '<div class="modal-dialog modal-dialog-centered ' + (tam || '') + '"><div class="modal-content">' +
        '<div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>' +
        '<div class="modal-body"></div><div class="modal-footer"></div></div></div>';
      document.body.appendChild(el);
    }
    var inst = bootstrap.Modal.getOrCreateInstance(el);
    return {
      el: el,
      mostrar: function (titulo, cuerpo, pie) {
        $('.modal-title', el).textContent = titulo;
        $('.modal-body', el).innerHTML = cuerpo;
        $('.modal-footer', el).innerHTML = pie || '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cerrar</button>';
        inst.show();
      },
      cerrar: function () { inst.hide(); }
    };
  }

  // Campos de formulario con el estilo del panel
  function campo(id, etiqueta, tipo, valor, extra) {
    return '<div class="campo"><label class="form-label-custom" for="' + id + '">' + etiqueta + '</label>' +
      '<input type="' + tipo + '" class="form-control-custom" id="' + id + '" value="' + esc(valor) + '" ' + (extra || '') + '><div class="msg-error" hidden></div></div>';
  }
  function selectHtml(id, etiqueta, opciones, valor, extra) {
    return '<div class="campo"><label class="form-label-custom" for="' + id + '">' + etiqueta + '</label>' +
      '<select class="form-select-custom" id="' + id + '" ' + (extra || '') + '>' + opciones.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valor) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select><div class="msg-error" hidden></div></div>';
  }
  function marcarError(id, msg) {
    var inp = $('#' + id); if (!inp) return;
    inp.classList.add('is-invalid-custom');
    var m = inp.parentNode.querySelector('.msg-error'); m.textContent = msg; m.hidden = false;
  }
  function limpiarErrores(cont) {
    $$('.is-invalid-custom', cont).forEach(function (i) { i.classList.remove('is-invalid-custom'); });
    $$('.msg-error', cont).forEach(function (m) { m.hidden = true; });
  }

  // Insignias de la plantilla (success / pending / failed / gris)
  var BADGE_PEDIDO = { pendiente: 'pending', pagada: 'success', cancelada: 'failed' };
  function badgePedido(nombre) { return '<span class="badge-table ' + (BADGE_PEDIDO[nombre] || 'gris') + '">' + esc(nombre.charAt(0).toUpperCase() + nombre.slice(1)) + '</span>'; }
  function badgeActivo(v, si, no) { return '<span class="badge-table ' + (v ? 'success' : 'gris') + '">' + (v ? si : no) + '</span>'; }

  function sinDatos(cols, texto) { return '<tr><td colspan="' + cols + '" class="sin-datos">' + texto + '</td></tr>'; }
  function iniciales(u) { return ((u.nombre || '?')[0] + (u.apellido || '')[0]).toUpperCase(); }

  // Lista de ciudades para los <select>: "Palermo, Sicilia (Italia)"
  function opcionesCiudades(conVacio) {
    var o = Datos.tabla('ciudades').map(function (c) { return [c.id, Datos.ciudadCompleta(c.id)]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); });
    return conVacio ? [['', '— Sin especificar —']].concat(o) : o;
  }
  function opcionesDe(tabla) { return Datos.tabla(tabla).map(function (f) { return [f.id, f.nombre]; }); }

  // Métodos con los que el equipo registra un cobro (la misma lista que valida api/cobro.php)
  var METODOS_COBRO = ['Efectivo', 'Transferencia', 'Tarjeta (posnet)', 'Otro'];
  // Día (YYYY-MM-DD) de un valor guardado como "2026-11-06T21:16:34" o "2026-11-06 21:16:34"
  function dia(v) { return String(v || '').slice(0, 10); }
  // Dinero con signo: los reembolsos (negativos) se pintan en rojo
  function montoHtml(n) { return '<span class="' + (n < 0 ? 'text-danger' : '') + '">' + dinero(n) + '</span>'; }
  // Texto de un pago: "Visa ···· 4242", "Efectivo" o "Reembolso"
  function textoPago(g) { return esc(g.marca) + (g.ultimos4 ? ' ···· ' + esc(g.ultimos4) : ''); }

  // Ventana "Registrar cobro" (se usa desde Reservas). alTerminar() se llama si se guardó.
  function abrirCobro(p, alTerminar) {
    var mc = modal('m-cobro');
    var saldo = Datos.saldoDe(p.id);
    if (saldo <= 0) { aviso('Esta reserva no tiene saldo pendiente', 'error'); return; }
    var cuerpo = '<form id="f-cobro" novalidate>' +
      '<div class="detalle-fila"><span>Reserva</span><strong>' + esc(p.codigo) + ' · ' + esc(Datos.nombreUsuario(p.usuario_id)) + '</strong></div>' +
      '<div class="detalle-fila"><span>Total</span><span>' + dinero(p.total) + '</span></div>' +
      '<div class="detalle-fila"><span>Ya cobrado</span><span>' + dinero(Datos.cobradoDe(p.id)) + '</span></div>' +
      '<div class="detalle-fila mb-3"><span><strong>Saldo pendiente</strong></span><strong>' + dinero(saldo) + '</strong></div>' +
      selectHtml('c-metodo', 'Método de cobro', METODOS_COBRO.map(function (x) { return [x, x]; }), 'Efectivo') +
      campo('c-monto', 'Monto cobrado ($)', 'number', saldo, 'min="1" max="' + saldo + '" step="0.01"') +
      campo('c-nota', 'Nota (opcional: nº de comprobante, quién cobró...)', 'text', '', 'maxlength="200"') + '</form>';
    mc.mostrar('Registrar cobro', cuerpo,
      '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cancelar</button>' +
      '<button type="button" class="btn-custom btn-custom-primary" id="guardar-cobro">Registrar cobro</button>');
    $('#guardar-cobro').onclick = function () {
      var f = $('#f-cobro'); limpiarErrores(f);
      var monto = Number($('#c-monto').value);
      if (!(monto > 0)) { marcarError('c-monto', 'Ingresá un monto mayor a 0'); return; }
      if (monto > saldo + 0.001) { marcarError('c-monto', 'El monto supera el saldo pendiente (' + dinero(saldo) + ')'); return; }
      try {
        Datos.registrarCobro({ pedido_id: p.id, metodo: $('#c-metodo').value, monto: monto, nota: $('#c-nota').value.trim() });
      } catch (err) { aviso(err.message, 'error'); return; }
      mc.cerrar();
      var nuevo = Datos.buscar('pedidos', p.id);
      aviso(nuevo.estado_id === Datos.ESTADO.PAGADA ? 'Cobro registrado: la reserva quedó pagada' : 'Cobro registrado');
      if (alTerminar) alTerminar();
    };
  }

  // =====================================================================
  // 2. MÓDULOS (UNO POR PANTALLA)
  // =====================================================================
  var paginas = {};

  // ---------------------------------------------------------------
  // RESUMEN
  // ---------------------------------------------------------------
  paginas.index = function () {
    var pedidos = Datos.tabla('pedidos'), pagados = pedidos.filter(function (p) { return p.estado_id === Datos.ESTADO.PAGADA; });
    var ingresos = pagados.reduce(function (s, p) { return s + p.total; }, 0);

    // Ingresos por mes (últimos 6 meses), sólo pedidos pagados
    var meses = [], hoy = new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({ clave: d.getFullYear() + '-' + d.getMonth(), nombre: d.toLocaleDateString('es-AR', { month: 'short' }), total: 0 });
    }
    pagados.forEach(function (p) {
      var f = new Date(p.creado_en), m = meses.filter(function (x) { return x.clave === f.getFullYear() + '-' + f.getMonth(); })[0];
      if (m) m.total += p.total;
    });
    var actual = meses[5].total, anterior = meses[4].total;
    var variacion = anterior ? Math.round((actual - anterior) / anterior * 100) : null;

    var clientes = Datos.tabla('usuarios').filter(function (u) { return u.rol_id === Datos.ROL.CLIENTE; });
    var pendientes = pedidos.filter(function (p) { return p.estado_id === Datos.ESTADO.PENDIENTE; }).length;
    var activas = Datos.tabla('excursiones').filter(function (e) { return e.activa; });

    $('#st-ingresos').textContent = dinero(ingresos);
    $('#st-ingresos-var').innerHTML = variacion === null ? 'Sin mes anterior para comparar'
      : '<i class="bi bi-arrow-' + (variacion >= 0 ? 'up-right' : 'down-left') + '"></i> <span>' + (variacion >= 0 ? '+' : '') + variacion + '% vs. mes anterior</span>';
    $('#st-ingresos-var').className = 'trend-badge ' + (variacion !== null && variacion < 0 ? 'trend-down' : 'trend-up');
    $('#st-pedidos').textContent = pedidos.length;
    $('#st-pendientes').textContent = pendientes + (pendientes === 1 ? ' pendiente de pago' : ' pendientes de pago');
    $('#st-excursiones').textContent = activas.length;
    $('#st-clientes').textContent = clientes.length;

    // Gráfico de barras: ingresos por mes
    new ApexCharts($('#grafico-ingresos'), {
      series: [{ name: 'Ingresos', data: meses.map(function (m) { return m.total; }) }],
      chart: { type: 'bar', height: 240, toolbar: { show: false }, fontFamily: 'Plus Jakarta Sans, sans-serif' },
      colors: ['#072F1F'], plotOptions: { bar: { columnWidth: '42%', borderRadius: 4 } }, dataLabels: { enabled: false },
      grid: { borderColor: '#E9EFEF', strokeDashArray: 4 },
      xaxis: { categories: meses.map(function (m) { return m.nombre; }), axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#6C7E75', fontSize: '11px' } } },
      yaxis: { labels: { formatter: function (v) { return '$' + v; }, style: { colors: '#6C7E75', fontSize: '11px' } } },
      tooltip: { theme: 'dark', y: { formatter: dinero } }
    }).render();

    // Dona: personas reservadas por tipo de excursión (pedidos no cancelados)
    var porTipo = {};
    Datos.tabla('pedido_items').forEach(function (it) {
      var p = Datos.buscar('pedidos', it.pedido_id), ex = Datos.buscar('excursiones', it.excursion_id);
      if (!p || !ex || p.estado_id === Datos.ESTADO.CANCELADA) return;
      var t = Datos.nombreDe('tipos_excursion', ex.tipo_excursion_id);
      porTipo[t] = (porTipo[t] || 0) + it.personas;
    });
    var tipos = Object.keys(porTipo);
    if (tipos.length) {
      new ApexCharts($('#grafico-tipos'), {
        series: tipos.map(function (t) { return porTipo[t]; }), labels: tipos,
        chart: { type: 'donut', height: 260, fontFamily: 'Plus Jakarta Sans, sans-serif' },
        colors: ['#072F1F', '#B4F105', '#F97316', '#1A3E30', '#6C7E75', '#22C55E', '#EF4444'],
        legend: { position: 'bottom', fontSize: '12px' }, dataLabels: { enabled: false },
        plotOptions: { pie: { donut: { size: '68%', labels: { show: true, total: { show: true, label: 'Personas', fontSize: '12px' } } } } },
        tooltip: { theme: 'dark' }
      }).render();
    } else { $('#grafico-tipos').innerHTML = '<div class="sin-datos">Todavía no hay reservas.</div>'; }

    // Últimas reservas
    var ultimas = pedidos.slice().sort(function (a, b) { return b.creado_en.localeCompare(a.creado_en); }).slice(0, 6);
    $('#tabla-ultimas').innerHTML = ultimas.length ? ultimas.map(function (p) {
      return '<tr><td class="table-order-id">' + esc(p.codigo) + '</td><td>' + esc(Datos.nombreUsuario(p.usuario_id)) + '</td>' +
        '<td class="table-amount">' + dinero(p.total) + '</td><td>' + fecha(p.creado_en) + '</td><td>' + badgePedido(Datos.nombreDe('estados_pedido', p.estado_id)) + '</td></tr>';
    }).join('') : sinDatos(5, 'Todavía no hay reservas');

    // Ocupación de cada excursión activa
    $('#ocupacion').innerHTML = activas.map(function (e) {
      var oc = Datos.ocupados(e.id), pct = Math.min(100, Math.round(oc / e.capacidad * 100));
      return '<div class="progress-container"><div class="progress-label-row"><span class="progress-label">' + esc(e.nombre) + '</span>' +
        '<span class="progress-value">' + oc + ' / ' + e.capacidad + '</span></div>' +
        '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="progress-bar ' + (pct >= 90 ? 'bg-brand-orange' : 'bg-lime-accent') + '" style="width:' + pct + '%"></div></div></div>';
    }).join('') || '<div class="sin-datos">No hay excursiones activas.</div>';
  };

  // ---------------------------------------------------------------
  // EXCURSIONES
  // ---------------------------------------------------------------
  paginas.excursiones = function () {
    var m = modal('m-excursion', 'modal-lg');
    var IMAGENES = ['destination-1', 'destination-2', 'destination-3', 'destination-4', 'destination-5', 'destination-6', 'bg_1', 'bg_2', 'bg_3', 'trekking-1', 'paracaidas-2']
      .map(function (n) { return 'images/' + n + '.jpg'; });

    function pintar() {
      var q = $('#buscar').value.trim().toLowerCase(), est = $('#filtro-estado').value;
      var filas = Datos.tabla('excursiones').filter(function (e) {
        var texto = (e.nombre + ' ' + Datos.nombreDe('tipos_excursion', e.tipo_excursion_id) + ' ' + Datos.ciudadCompleta(e.ciudad_id)).toLowerCase();
        return (!q || texto.indexOf(q) >= 0) && (est === '' || String(e.activa) === est);
      });
      $('#cuenta').textContent = filas.length + (filas.length === 1 ? ' excursión' : ' excursiones');
      $('#tabla-cuerpo').innerHTML = filas.length ? filas.map(function (e) {
        var oc = Datos.ocupados(e.id);
        return '<tr data-id="' + e.id + '"><td><div class="table-user-cell"><div class="mini-foto" style="background-image:url(\'' + esc(urlImagen(e.imagen)) + '\')"></div>' +
          '<div><div class="table-user-name">' + esc(e.nombre) + '</div><div class="table-user-sub">' + esc(Datos.ciudadCompleta(e.ciudad_id)) + '</div></div></div></td>' +
          '<td>' + esc(Datos.nombreDe('tipos_excursion', e.tipo_excursion_id)) + '</td><td>' + fecha(e.fecha_salida) + '</td>' +
          '<td class="table-amount">' + dinero(e.precio) + '</td>' +
          '<td>' + oc + ' / ' + e.capacidad + '<div class="texto-suave">' + Datos.libres(e.id) + ' libres</div></td>' +
          '<td>' + badgeActivo(e.activa, 'Activa', 'Inactiva') + '</td>' +
          '<td><div class="d-flex justify-content-center gap-1">' +
          '<a href="#" class="table-btn-action" data-acc="editar" title="Editar"><i class="bi bi-pencil"></i></a>' +
          '<a href="#" class="table-btn-action" data-acc="alternar" title="' + (e.activa ? 'Desactivar' : 'Activar') + '"><i class="bi bi-' + (e.activa ? 'eye-slash' : 'eye') + '"></i></a>' +
          '<a href="#" class="table-btn-action delete" data-acc="borrar" title="Eliminar"><i class="bi bi-trash"></i></a></div></td></tr>';
      }).join('') : sinDatos(7, 'No hay excursiones que coincidan');
    }

    function formulario(e) {
      e = e || { nombre: '', descripcion: '', tipo_excursion_id: 1, ciudad_id: 1, precio: '', capacidad: '', fecha_salida: '', imagen: 'images/destination-1.jpg', activa: 1 };
      return '<form id="f-excursion" novalidate><div class="row g-3"><div class="col-md-8">' + campo('f-nombre', 'Nombre', 'text', e.nombre, 'maxlength="120"') + '</div>' +
        '<div class="col-md-4">' + selectHtml('f-tipo', 'Tipo de excursión', opcionesDe('tipos_excursion'), e.tipo_excursion_id) + '</div>' +
        '<div class="col-12"><div class="campo"><label class="form-label-custom" for="f-desc">Descripción</label><textarea class="form-control-custom" id="f-desc" rows="3">' + esc(e.descripcion) + '</textarea></div></div>' +
        '<div class="col-md-6">' + selectHtml('f-ciudad', 'Destino (ciudad)', opcionesCiudades(false), e.ciudad_id) + '</div>' +
        '<div class="col-md-6">' + campo('f-fecha', 'Fecha de salida', 'date', e.fecha_salida) + '</div>' +
        '<div class="col-md-4">' + campo('f-precio', 'Precio por persona ($)', 'number', e.precio, 'min="1" step="1"') + '</div>' +
        '<div class="col-md-4">' + campo('f-capacidad', 'Capacidad (lugares)', 'number', e.capacidad, 'min="1" step="1"') + '</div>' +
        '<div class="col-md-4"><div class="campo"><label class="form-label-custom">Estado</label><label class="form-check-custom mt-2"><input class="form-check-input-custom" type="checkbox" id="f-activa"' + (e.activa ? ' checked' : '') + '> <span class="form-check-label">Visible en el sitio</span></label></div></div>' +
        '<div class="col-12">' + campo('f-imagen', 'Imagen (ruta dentro del sitio)', 'text', e.imagen, 'list="lista-imagenes" placeholder="images/destination-1.jpg"') +
        '<datalist id="lista-imagenes">' + IMAGENES.map(function (i) { return '<option value="' + i + '">'; }).join('') + '</datalist>' +
        // Subir una imagen propia: se guarda en images/excursiones/ y su ruta se completa sola arriba
        '<div class="d-flex align-items-center gap-3 mt-2"><div id="f-vista" class="mini-foto" style="width:64px;height:64px;background-image:url(\'' + esc(urlImagen(e.imagen)) + '\')"></div>' +
        '<div class="flex-grow-1"><label class="form-label-custom" for="f-archivo">O subir una imagen (JPG, PNG, WEBP o GIF, máx. 5 MB)</label>' +
        '<input type="file" class="form-control-custom" id="f-archivo" accept="image/jpeg,image/png,image/webp,image/gif"><div class="msg-error" hidden></div></div></div>' +
        '</div></div></form>';
    }

    function abrirFormulario(e) {
      var pie = '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cancelar</button>' +
        '<button type="button" class="btn-custom btn-custom-primary" id="guardar-excursion">Guardar</button>';
      m.mostrar(e ? 'Editar excursión' : 'Nueva excursión', formulario(e), pie);
      $('#guardar-excursion').onclick = function () { guardar(e); };
      var vista = function () { $('#f-vista').style.backgroundImage = "url('" + urlImagen($('#f-imagen').value.trim()).replace(/'/g, '%27') + "')"; };
      $('#f-imagen').addEventListener('input', vista);
      $('#f-archivo').addEventListener('change', function () {
        var arch = this.files && this.files[0]; if (!arch) return;
        limpiarErrores($('#f-archivo').parentNode);
        if (arch.size > 5 * 1024 * 1024) { marcarError('f-archivo', 'La imagen supera los 5 MB'); this.value = ''; return; }
        try {
          $('#f-imagen').value = Datos.subirImagen(arch);
          vista(); aviso('Imagen subida');
        } catch (err) { marcarError('f-archivo', err.message); this.value = ''; }
      });
    }

    function guardar(e) {
      var f = $('#f-excursion'); limpiarErrores(f);
      var ok = true;
      var nombre = $('#f-nombre').value.trim(), precio = Number($('#f-precio').value), cap = parseInt($('#f-capacidad').value, 10);
      if (nombre.length < 3) { marcarError('f-nombre', 'Ingresá un nombre (mínimo 3 letras)'); ok = false; }
      if (!(precio > 0)) { marcarError('f-precio', 'El precio debe ser mayor a 0'); ok = false; }
      if (!(cap > 0)) { marcarError('f-capacidad', 'La capacidad debe ser mayor a 0'); ok = false; }
      else if (e && cap < Datos.ocupados(e.id)) { marcarError('f-capacidad', 'Ya hay ' + Datos.ocupados(e.id) + ' lugares reservados'); ok = false; }
      if (!$('#f-fecha').value) { marcarError('f-fecha', 'Ingresá la fecha de salida'); ok = false; }
      if (!ok) return;
      var datos = {
        nombre: nombre, descripcion: $('#f-desc').value.trim(), tipo_excursion_id: Number($('#f-tipo').value), ciudad_id: Number($('#f-ciudad').value),
        precio: precio, capacidad: cap, fecha_salida: $('#f-fecha').value || null, imagen: $('#f-imagen').value.trim(), activa: $('#f-activa').checked ? 1 : 0
      };
      if (e) Datos.actualizar('excursiones', e.id, datos); else Datos.insertar('excursiones', datos);
      m.cerrar(); pintar(); aviso(e ? 'Excursión actualizada' : 'Excursión creada');
    }

    $('#tabla-cuerpo').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-acc]'); if (!b) return; ev.preventDefault();
      var id = Number(b.closest('tr').getAttribute('data-id')), e = Datos.buscar('excursiones', id);
      if (b.getAttribute('data-acc') === 'editar') abrirFormulario(e);
      else if (b.getAttribute('data-acc') === 'alternar') { Datos.actualizar('excursiones', id, { activa: e.activa ? 0 : 1 }); pintar(); aviso(e.activa ? 'Excursión desactivada' : 'Excursión activada'); }
      else if (b.getAttribute('data-acc') === 'borrar') {
        // No se puede borrar si ya tiene reservas: se debe desactivar para conservar el historial
        var usada = Datos.tabla('pedido_items').some(function (it) { return it.excursion_id === id; });
        if (usada) { aviso('Tiene reservas asociadas: desactivala en vez de eliminarla', 'error'); return; }
        if (confirm('¿Eliminar "' + e.nombre + '"? Esta acción no se puede deshacer.')) { Datos.eliminar('excursiones', id); pintar(); aviso('Excursión eliminada'); }
      }
    });
    $('#btn-nueva').addEventListener('click', function () { abrirFormulario(null); });
    $('#buscar').addEventListener('input', pintar);
    $('#filtro-estado').addEventListener('change', pintar);
    pintar();
    if (new URLSearchParams(location.search).get('nueva')) abrirFormulario(null);
  };

  // ---------------------------------------------------------------
  // PEDIDOS (RESERVAS)
  // ---------------------------------------------------------------
  paginas.pedidos = function () {
    var mDetalle = modal('m-detalle', 'modal-lg'), mNueva = modal('m-nueva', 'modal-lg');

    function resumenItems(p) {
      return Datos.itemsDe(p.id).map(function (it) {
        var ex = Datos.buscar('excursiones', it.excursion_id);
        return esc(ex ? ex.nombre : '?') + ' ×' + it.personas;
      }).join('<br>');
    }

    // Selector de excursión del filtro: todas las que existen
    $('#filtro-excursion').innerHTML = '<option value="">Todas las excursiones</option>' + Datos.tabla('excursiones').map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.nombre) + '</option>';
    }).join('');

    // Estado de cobro de una reserva: 'sin' (nada cobrado), 'parcial', 'completo'. Las canceladas no cuentan.
    function estadoCobro(p) {
      if (p.estado_id === Datos.ESTADO.CANCELADA) return 'cancelada';
      var cobrado = Datos.cobradoDe(p.id);
      return cobrado <= 0 ? 'sin' : (cobrado >= p.total ? 'completo' : 'parcial');
    }

    function filtradas() {
      var q = $('#buscar').value.trim().toLowerCase(), est = $('#filtro-estado').value;
      var desde = $('#filtro-desde').value, hasta = $('#filtro-hasta').value;
      var ex = $('#filtro-excursion').value, cobro = $('#filtro-cobro').value;
      return Datos.tabla('pedidos').sort(function (a, b) { return b.creado_en.localeCompare(a.creado_en); }).filter(function (p) {
        var texto = (p.codigo + ' ' + Datos.nombreUsuario(p.usuario_id) + ' ' + ((Datos.buscar('usuarios', p.usuario_id) || {}).email || '')).toLowerCase();
        if (q && texto.indexOf(q) < 0) return false;
        if (est !== '' && String(p.estado_id) !== est) return false;
        if (desde && dia(p.creado_en) < desde) return false;
        if (hasta && dia(p.creado_en) > hasta) return false;
        if (ex && !Datos.itemsDe(p.id).some(function (it) { return String(it.excursion_id) === ex; })) return false;
        if (cobro && estadoCobro(p) !== cobro) return false;
        return true;
      });
    }

    function pintar() {
      var filas = filtradas();
      var cobradoTotal = filas.reduce(function (t, p) { return t + Datos.cobradoDe(p.id); }, 0);
      $('#cuenta').textContent = filas.length + (filas.length === 1 ? ' reserva' : ' reservas') + ' · cobrado: ' + dinero(cobradoTotal);
      $('#tabla-cuerpo').innerHTML = filas.length ? filas.map(function (p) {
        var estado = Datos.nombreDe('estados_pedido', p.estado_id);
        var cancelada = p.estado_id === Datos.ESTADO.CANCELADA, saldo = Datos.saldoDe(p.id);
        var cobrado = Datos.cobradoDe(p.id);
        var cobroHtml = dinero(cobrado) + (cancelada ? '' : (saldo > 0 ? '<div class="texto-suave">Falta ' + dinero(saldo) + '</div>' : ''));
        return '<tr data-id="' + p.id + '"><td class="table-order-id">' + esc(p.codigo) + '</td>' +
          '<td><div class="table-user-name">' + esc(Datos.nombreUsuario(p.usuario_id)) + '</div><div class="table-user-sub">' + (p.creado_por ? 'Cargada por ' + esc(Datos.nombreUsuario(p.creado_por)) : 'Compra en la web') + '</div></td>' +
          '<td>' + resumenItems(p) + '</td><td class="table-amount">' + dinero(p.total) + '</td><td>' + cobroHtml + '</td><td>' + fecha(p.creado_en) + '</td><td>' + badgePedido(estado) + '</td>' +
          '<td><div class="d-flex justify-content-center gap-1">' +
          '<a href="#" class="table-btn-action" data-acc="ver" title="Ver detalle"><i class="bi bi-eye"></i></a>' +
          (!cancelada && saldo > 0 ? '<a href="#" class="table-btn-action" data-acc="cobro" title="Registrar cobro"><i class="bi bi-cash-coin"></i></a>' : '') +
          (!cancelada ? '<a href="#" class="table-btn-action delete" data-acc="cancelada" title="Cancelar reserva"><i class="bi bi-x-circle"></i></a>' : '<a href="#" class="table-btn-action" data-acc="pendiente" title="Reabrir como pendiente"><i class="bi bi-arrow-counterclockwise"></i></a><a href="#" class="table-btn-action delete" data-acc="eliminar" title="Eliminar reserva cancelada"><i class="bi bi-trash"></i></a>') +
          '</div></td></tr>';
      }).join('') : sinDatos(8, 'No hay reservas que coincidan');
    }

    function verDetalle(p) {
      var u = Datos.buscar('usuarios', p.usuario_id);
      var items = Datos.itemsDe(p.id).map(function (it) {
        var ex = Datos.buscar('excursiones', it.excursion_id);
        return '<div class="detalle-fila"><span>' + esc(ex ? ex.nombre : 'Excursión eliminada') + ' · ' + it.personas + ' pers. × ' + dinero(it.precio_unitario) + '</span><strong>' + dinero(it.personas * it.precio_unitario) + '</strong></div>';
      }).join('');
      var pagos = Datos.pagosDe(p.id).map(function (g) {
        return '<div class="detalle-fila"><span>' + textoPago(g) + ' · ' + fecha(g.creado_en) + (g.motivo ? '<div class="texto-suave">' + esc(g.motivo) + '</div>' : '') + '</span>' +
          '<span>' + (g.aprobado ? '<span class="badge-table success">Aprobado</span>' : '<span class="badge-table failed">Rechazado</span>') + ' ' + montoHtml(Number(g.monto)) + '</span></div>';
      }).join('') || '<div class="texto-suave">Todavía no hay cobros registrados.</div>';
      var saldo = Datos.saldoDe(p.id);
      var html = '<div class="row g-4"><div class="col-md-5">' +
        '<div class="detalle-fila"><span>Código</span><strong>' + esc(p.codigo) + '</strong></div>' +
        '<div class="detalle-fila"><span>Estado</span>' + badgePedido(Datos.nombreDe('estados_pedido', p.estado_id)) + '</div>' +
        '<div class="detalle-fila"><span>Fecha</span><span>' + fecha(p.creado_en) + '</span></div>' +
        '<div class="detalle-fila"><span>Cliente</span><span>' + esc(u ? u.nombre + ' ' + u.apellido : '?') + '</span></div>' +
        '<div class="detalle-fila"><span>Email</span><span>' + esc(u ? u.email : '') + '</span></div>' +
        '<div class="detalle-fila"><span>Teléfono</span><span>' + esc(u && u.telefono ? u.telefono : '-') + '</span></div>' +
        '<div class="detalle-fila"><span>Origen</span><span>' + (p.creado_por ? 'Cargada por ' + esc(Datos.nombreUsuario(p.creado_por)) : 'Compra en la web') + '</span></div></div>' +
        '<div class="col-md-7"><h6 class="mb-2">Excursiones</h6>' + items +
        '<div class="detalle-fila"><span><strong>Total</strong></span><strong>' + dinero(p.total) + '</strong></div>' +
        '<h6 class="mt-3 mb-2">Cobros</h6>' + pagos +
        '<div class="detalle-fila"><span><strong>Cobrado</strong></span><strong>' + dinero(Datos.cobradoDe(p.id)) + '</strong></div>' +
        (saldo > 0 ? '<div class="detalle-fila"><span>Saldo pendiente</span><strong>' + dinero(saldo) + '</strong></div>' : '') +
        '</div></div>';
      var pie = '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cerrar</button>' +
        (saldo > 0 ? '<button type="button" class="btn-custom btn-custom-primary" id="detalle-cobrar"><i class="bi bi-cash-coin"></i> Registrar cobro</button>' : '');
      mDetalle.mostrar('Reserva ' + p.codigo, html, pie);
      var bc = $('#detalle-cobrar');
      if (bc) bc.onclick = function () { mDetalle.cerrar(); abrirCobro(p, pintar); };
    }

    // ----- Nueva reserva a nombre de un cliente -----
    function filaItem() {
      var ex = Datos.tabla('excursiones').filter(function (e) { return e.activa; });
      return '<div class="fila-item"><select class="form-select-custom it-ex">' + ex.map(function (e) {
        return '<option value="' + e.id + '" data-precio="' + e.precio + '">' + esc(e.nombre) + ' — ' + dinero(e.precio) + ' (' + Datos.libres(e.id) + ' libres)</option>';
      }).join('') + '</select><input type="number" class="form-control-custom it-pers" min="1" max="10" value="1" aria-label="Personas">' +
        '<a href="#" class="table-btn-action delete it-quitar" title="Quitar"><i class="bi bi-x-lg"></i></a></div>';
    }
    function totalNueva() {
      var t = 0;
      $$('#items-nueva .fila-item').forEach(function (f) {
        var sel = $('.it-ex', f), p = parseInt($('.it-pers', f).value, 10) || 0;
        t += (Number(sel.options[sel.selectedIndex].getAttribute('data-precio')) || 0) * p;
      });
      $('#total-nueva').textContent = dinero(t);
    }
    function abrirNueva() {
      var clientes = Datos.tabla('usuarios').filter(function (u) { return u.rol_id === Datos.ROL.CLIENTE && u.activo; })
        .map(function (u) { return [u.id, u.nombre + ' ' + u.apellido + ' — ' + u.email]; });
      if (!clientes.length) { aviso('Primero creá un cliente en Usuarios', 'error'); return; }
      var cuerpo = '<form id="f-nueva" novalidate>' + selectHtml('n-cliente', 'Cliente', clientes, clientes[0][0]) +
        selectHtml('n-estado', 'Estado inicial', [[Datos.ESTADO.PENDIENTE, 'Pendiente de pago'], [Datos.ESTADO.PAGADA, 'Pagada (se registra el cobro completo)']], Datos.ESTADO.PENDIENTE) +
        '<div id="n-metodo-caja" hidden>' + selectHtml('n-metodo', 'Método de cobro', METODOS_COBRO.map(function (x) { return [x, x]; }), 'Efectivo') + '</div>' +
        '<label class="form-label-custom">Excursiones</label><div id="items-nueva">' + filaItem() + '</div>' +
        '<a href="#" id="agregar-item" class="btn-custom btn-custom-light btn-custom-sm mt-1"><i class="bi bi-plus-lg"></i> Agregar otra excursión</a>' +
        '<div class="detalle-fila mt-3"><span><strong>Total</strong></span><strong id="total-nueva">$ 0</strong></div></form>';
      mNueva.mostrar('Nueva reserva', cuerpo,
        '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn-custom btn-custom-primary" id="guardar-nueva">Crear reserva</button>');
      totalNueva();
      $('#n-estado').addEventListener('change', function () { $('#n-metodo-caja').hidden = Number(this.value) !== Datos.ESTADO.PAGADA; });
      $('#agregar-item').onclick = function (ev) { ev.preventDefault(); $('#items-nueva').insertAdjacentHTML('beforeend', filaItem()); totalNueva(); };
      $('#items-nueva').addEventListener('input', totalNueva);
      $('#items-nueva').addEventListener('click', function (ev) {
        var q = ev.target.closest('.it-quitar'); if (!q) return; ev.preventDefault();
        if ($$('#items-nueva .fila-item').length > 1) { q.closest('.fila-item').remove(); totalNueva(); }
      });
      $('#guardar-nueva').onclick = function () {
        var items = $$('#items-nueva .fila-item').map(function (f) { return { excursion_id: Number($('.it-ex', f).value), personas: parseInt($('.it-pers', f).value, 10) || 0 }; });
        if (items.some(function (i) { return i.personas < 1 || i.personas > 10; })) { aviso('Cada excursión debe tener entre 1 y 10 personas', 'error'); return; }
        // Si repitió una excursión se suman las personas (un solo ítem por excursión)
        var unidos = {}; items.forEach(function (i) { unidos[i.excursion_id] = (unidos[i.excursion_id] || 0) + i.personas; });
        items = Object.keys(unidos).map(function (k) { return { excursion_id: Number(k), personas: unidos[k] }; });
        var pagada = Number($('#n-estado').value) === Datos.ESTADO.PAGADA;
        try {
          Datos.crearPedido({
            usuario_id: Number($('#n-cliente').value), creado_por: yo.id, estado_id: Number($('#n-estado').value), items: items,
            pago: pagada ? { marca: $('#n-metodo').value } : null
          });
        } catch (err) { aviso(err.message, 'error'); return; }
        mNueva.cerrar(); pintar(); aviso('Reserva creada');
      };
    }

    $('#tabla-cuerpo').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-acc]'); if (!b) return; ev.preventDefault();
      var id = Number(b.closest('tr').getAttribute('data-id')), p = Datos.buscar('pedidos', id), acc = b.getAttribute('data-acc');
      if (acc === 'ver') return verDetalle(p);
      if (acc === 'cobro') return abrirCobro(p, pintar);
      if (acc === 'eliminar') {
        if (!confirm('¿Eliminar la reserva cancelada ' + p.codigo + '?\n\nSe borra para siempre, junto con sus cobros y reembolsos. Los lugares ya estaban libres.')) return;
        try { Datos.eliminar('pedidos', id); } catch (err) { return; }
        pintar(); aviso('Reserva ' + p.codigo + ' eliminada'); return;
      }
      if (acc === 'cancelada') {
        var cobrado = Datos.cobradoDe(p.id);
        if (!confirm('¿Cancelar la reserva ' + p.codigo + '? Los lugares quedan libres.' + (cobrado > 0 ? '\n\nSe registrará un reembolso de ' + dinero(cobrado) + '.' : ''))) return;
      }
      var nuevo = { cancelada: Datos.ESTADO.CANCELADA, pendiente: Datos.ESTADO.PENDIENTE }[acc];
      // Al reabrir una reserva cancelada hay que revisar que sigan quedando lugares
      if (p.estado_id === Datos.ESTADO.CANCELADA) {
        var falta = Datos.itemsDe(p.id).filter(function (it) { return it.personas > Datos.libres(it.excursion_id); })[0];
        if (falta) { aviso('Ya no quedan lugares en "' + Datos.nombreDe('excursiones', falta.excursion_id) + '"', 'error'); return; }
      }
      Datos.actualizar('pedidos', id, { estado_id: nuevo }); pintar(); aviso('Reserva ' + p.codigo + ': ' + Datos.nombreDe('estados_pedido', nuevo));
    });
    $('#btn-nueva').addEventListener('click', abrirNueva);
    // Elimina de una vez todas las reservas CANCELADAS que se ven con los filtros actuales
    $('#btn-borrar-canceladas').addEventListener('click', function () {
      var lista = filtradas().filter(function (p) { return p.estado_id === Datos.ESTADO.CANCELADA; });
      if (!lista.length) { aviso('No hay reservas canceladas para eliminar con estos filtros', 'error'); return; }
      if (!confirm('¿Eliminar ' + lista.length + (lista.length === 1 ? ' reserva cancelada' : ' reservas canceladas') + '?\n\nSe borran para siempre, junto con sus cobros y reembolsos.')) return;
      var n = 0;
      try { lista.forEach(function (p) { Datos.eliminar('pedidos', p.id); n++; }); } catch (err) { /* el aviso ya lo mostró datos.js */ }
      pintar(); if (n) aviso(n + (n === 1 ? ' reserva eliminada' : ' reservas eliminadas'));
    });
    ['buscar'].forEach(function (id) { $('#' + id).addEventListener('input', pintar); });
    ['filtro-estado', 'filtro-desde', 'filtro-hasta', 'filtro-excursion', 'filtro-cobro'].forEach(function (id) { $('#' + id).addEventListener('change', pintar); });
    $('#filtro-limpiar').addEventListener('click', function () {
      ['buscar', 'filtro-estado', 'filtro-desde', 'filtro-hasta', 'filtro-excursion', 'filtro-cobro'].forEach(function (id) { $('#' + id).value = ''; });
      pintar();
    });
    pintar();
    if (new URLSearchParams(location.search).get('nueva')) abrirNueva();
  };

  // ---------------------------------------------------------------
  // COBROS: todos los movimientos de plata (cobros y reembolsos)
  // ---------------------------------------------------------------
  paginas.cobros = function () {
    var pagos = Datos.tabla('pagos').filter(function (g) { return g.aprobado; });
    var metodos = {};
    pagos.forEach(function (g) { metodos[g.marca] = 1; });
    $('#filtro-metodo').innerHTML = '<option value="">Todos los métodos</option>' + Object.keys(metodos).sort().map(function (m) {
      return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
    }).join('');

    function filtrados() {
      var q = $('#buscar').value.trim().toLowerCase(), met = $('#filtro-metodo').value, tipo = $('#filtro-tipo').value;
      var desde = $('#filtro-desde').value, hasta = $('#filtro-hasta').value;
      return Datos.tabla('pagos').filter(function (g) { return g.aprobado; })
        .sort(function (a, b) { return String(b.creado_en).localeCompare(String(a.creado_en)) || b.id - a.id; })
        .filter(function (g) {
          var p = Datos.buscar('pedidos', g.pedido_id);
          var texto = ((p ? p.codigo : '') + ' ' + (p ? Datos.nombreUsuario(p.usuario_id) : '') + ' ' + (g.motivo || '')).toLowerCase();
          if (q && texto.indexOf(q) < 0) return false;
          if (met && g.marca !== met) return false;
          if (tipo === 'cobro' && !(Number(g.monto) > 0)) return false;
          if (tipo === 'reembolso' && !(Number(g.monto) < 0)) return false;
          if (desde && dia(g.creado_en) < desde) return false;
          if (hasta && dia(g.creado_en) > hasta) return false;
          return true;
        });
    }

    function pintar() {
      var filas = filtrados(), cobrado = 0, reembolsado = 0;
      filas.forEach(function (g) { var m = Number(g.monto); if (m > 0) cobrado += m; else reembolsado += -m; });
      $('#tot-cobrado').textContent = dinero(cobrado);
      $('#tot-reembolsado').textContent = dinero(reembolsado);
      $('#tot-neto').textContent = dinero(cobrado - reembolsado);
      $('#cuenta').textContent = filas.length + (filas.length === 1 ? ' movimiento' : ' movimientos');
      $('#tabla-cuerpo').innerHTML = filas.length ? filas.map(function (g) {
        var p = Datos.buscar('pedidos', g.pedido_id), m = Number(g.monto);
        return '<tr><td>' + fecha(g.creado_en) + '</td><td class="table-order-id">' + esc(p ? p.codigo : '?') + '</td>' +
          '<td>' + esc(p ? Datos.nombreUsuario(p.usuario_id) : '?') + '</td><td>' + textoPago(g) + '</td>' +
          '<td>' + (m < 0 ? '<span class="badge-table failed">Reembolso</span>' : '<span class="badge-table success">Cobro</span>') + (g.motivo ? '<div class="texto-suave">' + esc(g.motivo) + '</div>' : '') + '</td>' +
          '<td class="table-amount">' + montoHtml(m) + '</td></tr>';
      }).join('') : sinDatos(6, 'No hay movimientos que coincidan');
    }

    ['buscar'].forEach(function (id) { $('#' + id).addEventListener('input', pintar); });
    ['filtro-metodo', 'filtro-tipo', 'filtro-desde', 'filtro-hasta'].forEach(function (id) { $('#' + id).addEventListener('change', pintar); });
    $('#filtro-limpiar').addEventListener('click', function () {
      ['buscar', 'filtro-metodo', 'filtro-tipo', 'filtro-desde', 'filtro-hasta'].forEach(function (id) { $('#' + id).value = ''; });
      pintar();
    });
    pintar();
  };

  // ---------------------------------------------------------------
  // USUARIOS
  // ---------------------------------------------------------------
  paginas.usuarios = function () {
    var m = modal('m-usuario', 'modal-lg'), mVer = modal('m-ver-usuario', 'modal-lg');

    function pintar() {
      var q = $('#buscar').value.trim().toLowerCase(), rol = $('#filtro-rol').value;
      var filas = Datos.tabla('usuarios').filter(function (u) {
        return (!q || (u.nombre + ' ' + u.apellido + ' ' + u.email + ' ' + (u.dni || '')).toLowerCase().indexOf(q) >= 0) && (rol === '' || String(u.rol_id) === rol);
      });
      $('#cuenta').textContent = filas.length + (filas.length === 1 ? ' usuario' : ' usuarios');
      $('#tabla-cuerpo').innerHTML = filas.length ? filas.map(function (u) {
        var n = Datos.tabla('pedidos').filter(function (p) { return p.usuario_id === u.id; }).length;
        var admin = u.rol_id === Datos.ROL.ADMIN, yoMismo = u.id === yo.id;
        return '<tr data-id="' + u.id + '"><td><div class="table-user-cell"><div class="mini-foto" style="display:flex;align-items:center;justify-content:center;font-weight:700;background:var(--brand-forest-light);color:var(--brand-lime);border-radius:50%">' + esc(iniciales(u)) + '</div>' +
          '<div><div class="table-user-name">' + esc(u.nombre + ' ' + u.apellido) + (yoMismo ? ' <span class="texto-suave">(vos)</span>' : '') + '</div><div class="table-user-sub">' + esc(u.email) + '</div></div></div></td>' +
          '<td><span class="badge-table ' + (admin ? 'pending' : 'success') + '">' + (admin ? 'Administrador' : 'Cliente') + '</span></td>' +
          '<td>' + esc(u.telefono || '-') + '<div class="texto-suave">DNI ' + esc(u.dni || '-') + '</div></td>' +
          '<td>' + esc(u.ciudad_id ? Datos.ciudadCompleta(u.ciudad_id) : '-') + '</td><td>' + n + '</td><td>' + badgeActivo(u.activo, 'Activo', 'Inactivo') + '</td>' +
          '<td><div class="d-flex justify-content-center gap-1">' +
          '<a href="#" class="table-btn-action" data-acc="ver" title="Ver reservas"><i class="bi bi-eye"></i></a>' +
          '<a href="#" class="table-btn-action" data-acc="editar" title="Editar"><i class="bi bi-pencil"></i></a>' +
          (yoMismo ? '' : '<a href="#" class="table-btn-action ' + (u.activo ? 'delete' : '') + '" data-acc="alternar" title="' + (u.activo ? 'Desactivar' : 'Activar') + '"><i class="bi bi-' + (u.activo ? 'person-x' : 'person-check') + '"></i></a>') +
          '</div></td></tr>';
      }).join('') : sinDatos(7, 'No hay usuarios que coincidan');
    }

    function formulario(u) {
      var nuevo = !u; u = u || { nombre: '', apellido: '', email: '', password: '', telefono: '', dni: '', ciudad_id: '', rol_id: Datos.ROL.CLIENTE, activo: 1 };
      var esYo = !nuevo && u.id === yo.id;
      return '<form id="f-usuario" novalidate><div class="row g-3"><div class="col-md-6">' + campo('u-nombre', 'Nombre', 'text', u.nombre) + '</div>' +
        '<div class="col-md-6">' + campo('u-apellido', 'Apellido', 'text', u.apellido) + '</div>' +
        '<div class="col-md-6">' + campo('u-email', 'Email', 'email', u.email) + '</div>' +
        '<div class="col-md-6">' + campo('u-pass', 'Contraseña', 'text', '', 'autocomplete="off" placeholder="' + (nuevo ? '' : 'Dejar vacío para no cambiarla') + '"') + '</div>' +
        '<div class="col-md-6">' + campo('u-tel', 'Teléfono', 'tel', u.telefono) + '</div>' +
        '<div class="col-md-6">' + campo('u-dni', 'DNI', 'text', u.dni, 'maxlength="8" inputmode="numeric"') + '</div>' +
        '<div class="col-md-6">' + selectHtml('u-ciudad', 'Ciudad', opcionesCiudades(true), u.ciudad_id || '') + '</div>' +
        '<div class="col-md-3">' + selectHtml('u-rol', 'Rol', opcionesDe('roles').map(function (r) { return [r[0], r[1].charAt(0).toUpperCase() + r[1].slice(1)]; }), u.rol_id, esYo ? 'disabled' : '') + '</div>' +
        '<div class="col-md-3"><div class="campo"><label class="form-label-custom">Estado</label><label class="form-check-custom mt-2"><input class="form-check-input-custom" type="checkbox" id="u-activo"' + (u.activo ? ' checked' : '') + (esYo ? ' disabled' : '') + '> <span class="form-check-label">Activo</span></label></div></div>' +
        '</div></form>';
    }

    function abrirFormulario(u) {
      m.mostrar(u ? 'Editar usuario' : 'Nuevo usuario', formulario(u),
        '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn-custom btn-custom-primary" id="guardar-usuario">Guardar</button>');
      $('#guardar-usuario').onclick = function () { guardar(u); };
    }

    function guardar(u) {
      limpiarErrores($('#f-usuario'));
      var ok = true, email = $('#u-email').value.trim().toLowerCase(), dni = $('#u-dni').value.replace(/\D/g, '');
      if ($('#u-nombre').value.trim().length < 2) { marcarError('u-nombre', 'Obligatorio'); ok = false; }
      if ($('#u-apellido').value.trim().length < 2) { marcarError('u-apellido', 'Obligatorio'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { marcarError('u-email', 'Email inválido'); ok = false; }
      else if (Datos.tabla('usuarios').some(function (x) { return x.email.toLowerCase() === email && (!u || x.id !== u.id); })) { marcarError('u-email', 'Ya existe una cuenta con ese email'); ok = false; }
      if ((!u || $('#u-pass').value) && $('#u-pass').value.length < 4) { marcarError('u-pass', 'Mínimo 4 caracteres'); ok = false; }
      if (dni && (dni.length < 7 || dni.length > 8)) { marcarError('u-dni', '7 u 8 números'); ok = false; }
      if (!ok) return;
      var d = {
        nombre: $('#u-nombre').value.trim(), apellido: $('#u-apellido').value.trim(), email: email,
        telefono: $('#u-tel').value.trim(), dni: dni, ciudad_id: $('#u-ciudad').value ? Number($('#u-ciudad').value) : null
      };
      if ($('#u-pass').value) d.password = $('#u-pass').value;   // vacío al editar = se conserva la actual
      if (!u || u.id !== yo.id) { d.rol_id = Number($('#u-rol').value); d.activo = $('#u-activo').checked ? 1 : 0; }
      if (u) Datos.actualizar('usuarios', u.id, d); else Datos.insertar('usuarios', d);
      m.cerrar(); pintar(); aviso(u ? 'Usuario actualizado' : 'Usuario creado');
    }

    function verUsuario(u) {
      var peds = Datos.tabla('pedidos').filter(function (p) { return p.usuario_id === u.id; }).sort(function (a, b) { return b.creado_en.localeCompare(a.creado_en); });
      var gastado = peds.filter(function (p) { return p.estado_id === Datos.ESTADO.PAGADA; }).reduce(function (s, p) { return s + p.total; }, 0);
      mVer.mostrar(u.nombre + ' ' + u.apellido,
        '<div class="row g-4"><div class="col-md-5">' +
        '<div class="detalle-fila"><span>Email</span><span>' + esc(u.email) + '</span></div>' +
        '<div class="detalle-fila"><span>Teléfono</span><span>' + esc(u.telefono || '-') + '</span></div>' +
        '<div class="detalle-fila"><span>DNI</span><span>' + esc(u.dni || '-') + '</span></div>' +
        '<div class="detalle-fila"><span>Ciudad</span><span>' + esc(u.ciudad_id ? Datos.ciudadCompleta(u.ciudad_id) : '-') + '</span></div>' +
        '<div class="detalle-fila"><span>Rol</span><span>' + esc(Datos.nombreDe('roles', u.rol_id)) + '</span></div>' +
        '<div class="detalle-fila"><span>Total pagado</span><strong>' + dinero(gastado) + '</strong></div></div>' +
        '<div class="col-md-7"><h6 class="mb-2">Reservas (' + peds.length + ')</h6>' + (peds.map(function (p) {
          return '<div class="detalle-fila"><span>' + esc(p.codigo) + ' · ' + fecha(p.creado_en) + '</span><span>' + badgePedido(Datos.nombreDe('estados_pedido', p.estado_id)) + ' ' + dinero(p.total) + '</span></div>';
        }).join('') || '<div class="texto-suave">Todavía no hizo reservas.</div>') + '</div></div>');
    }

    $('#tabla-cuerpo').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-acc]'); if (!b) return; ev.preventDefault();
      var id = Number(b.closest('tr').getAttribute('data-id')), u = Datos.buscar('usuarios', id), acc = b.getAttribute('data-acc');
      if (acc === 'ver') verUsuario(u);
      else if (acc === 'editar') abrirFormulario(u);
      else if (acc === 'alternar') {
        if (u.activo && !confirm('¿Desactivar a ' + u.nombre + '? No va a poder ingresar, pero se conserva su historial.')) return;
        Datos.actualizar('usuarios', id, { activo: u.activo ? 0 : 1 }); pintar(); aviso(u.activo ? 'Usuario desactivado' : 'Usuario activado');
      }
    });
    $('#btn-nueva').addEventListener('click', function () { abrirFormulario(null); });
    $('#buscar').addEventListener('input', pintar);
    $('#filtro-rol').addEventListener('change', pintar);
    pintar();
    if (new URLSearchParams(location.search).get('nueva')) abrirFormulario(null);
  };

  // ---------------------------------------------------------------
  // CATÁLOGOS (tablas de apoyo)
  // ---------------------------------------------------------------
  paginas.catalogos = function () {
    // Cada catálogo: tabla, título, padre (si depende de otra tabla) y dónde se usa (para impedir borrados)
    var CAT = {
      tipos_excursion: { titulo: 'Tipos de excursión', uno: 'tipo', refs: [['excursiones', 'tipo_excursion_id']] },
      paises: { titulo: 'Países', uno: 'país', refs: [['provincias', 'pais_id']] },
      provincias: { titulo: 'Provincias', uno: 'provincia', padre: ['pais_id', 'paises', 'País'], refs: [['ciudades', 'provincia_id']] },
      ciudades: { titulo: 'Ciudades', uno: 'ciudad', padre: ['provincia_id', 'provincias', 'Provincia'], refs: [['usuarios', 'ciudad_id'], ['excursiones', 'ciudad_id']] }
    };
    var actual = 'tipos_excursion', m = modal('m-cat');

    function pestanas() {
      $('#pestanas').innerHTML = Object.keys(CAT).map(function (k) {
        return '<button type="button" class="btn-custom btn-custom-sm btn-custom-outline-secondary' + (k === actual ? ' activa' : '') + '" data-cat="' + k + '">' + CAT[k].titulo + '</button>';
      }).join('');
    }
    function pintar() {
      var c = CAT[actual];
      $('#cat-titulo').textContent = c.titulo;
      $('#btn-nueva').innerHTML = '<i class="bi bi-plus-lg"></i> Agregar ' + c.uno;
      $('#cat-cabecera').innerHTML = '<th>ID</th><th>Nombre</th>' + (c.padre ? '<th>' + c.padre[2] + '</th>' : '') + '<th>En uso</th><th class="text-center">Acciones</th>';
      var filas = Datos.tabla(actual).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      $('#tabla-cuerpo').innerHTML = filas.length ? filas.map(function (f) {
        var usos = usosDe(f.id);
        return '<tr data-id="' + f.id + '"><td class="table-order-id">#' + f.id + '</td><td class="table-product-name">' + esc(f.nombre) + '</td>' +
          (c.padre ? '<td>' + esc(Datos.nombreDe(c.padre[1], f[c.padre[0]])) + '</td>' : '') +
          '<td>' + (usos ? usos + ' registro' + (usos === 1 ? '' : 's') : '<span class="texto-suave">Sin uso</span>') + '</td>' +
          '<td><div class="d-flex justify-content-center gap-1"><a href="#" class="table-btn-action" data-acc="editar" title="Editar"><i class="bi bi-pencil"></i></a>' +
          '<a href="#" class="table-btn-action delete" data-acc="borrar" title="Eliminar"><i class="bi bi-trash"></i></a></div></td></tr>';
      }).join('') : sinDatos(5, 'Todavía no hay registros');
      pestanas();
    }
    // Cuántos registros de otras tablas usan este valor (así se impide borrar algo en uso)
    function usosDe(id) {
      return CAT[actual].refs.reduce(function (s, r) { return s + Datos.tabla(r[0]).filter(function (x) { return x[r[1]] === id; }).length; }, 0);
    }
    function abrir(f) {
      var c = CAT[actual];
      var cuerpo = '<form id="f-cat" novalidate>' + campo('c-nombre', 'Nombre', 'text', f ? f.nombre : '', 'maxlength="80"') +
        (c.padre ? selectHtml('c-padre', c.padre[2], opcionesDe(c.padre[1]), f ? f[c.padre[0]] : '') : '') + '</form>';
      m.mostrar((f ? 'Editar ' : 'Agregar ') + c.uno, cuerpo,
        '<button type="button" class="btn-custom btn-custom-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn-custom btn-custom-primary" id="guardar-cat">Guardar</button>');
      $('#guardar-cat').onclick = function () {
        limpiarErrores($('#f-cat'));
        var nombre = $('#c-nombre').value.trim();
        if (nombre.length < 2) return marcarError('c-nombre', 'Ingresá un nombre');
        if (c.padre && !$('#c-padre').value) return marcarError('c-padre', 'Primero creá un ' + c.padre[2].toLowerCase());
        var d = { nombre: nombre }; if (c.padre) d[c.padre[0]] = Number($('#c-padre').value);
        if (f) Datos.actualizar(actual, f.id, d); else Datos.insertar(actual, d);
        m.cerrar(); pintar(); aviso('Guardado');
      };
    }
    $('#pestanas').addEventListener('click', function (ev) { var b = ev.target.closest('[data-cat]'); if (b) { actual = b.getAttribute('data-cat'); pintar(); } });
    $('#tabla-cuerpo').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-acc]'); if (!b) return; ev.preventDefault();
      var id = Number(b.closest('tr').getAttribute('data-id')), f = Datos.buscar(actual, id);
      if (b.getAttribute('data-acc') === 'editar') return abrir(f);
      if (usosDe(id)) { aviso('No se puede eliminar: está en uso', 'error'); return; }
      if (confirm('¿Eliminar "' + f.nombre + '"?')) { Datos.eliminar(actual, id); pintar(); aviso('Eliminado'); }
    });
    $('#btn-nueva').addEventListener('click', function () { abrir(null); });
    pintar();
  };

  // =====================================================================
  // 3. ARRANQUE
  // =====================================================================
  document.addEventListener('panel:listo', function () {
    var pag = document.body.getAttribute('data-pagina');
    if (paginas[pag]) paginas[pag]();
  });
})();
