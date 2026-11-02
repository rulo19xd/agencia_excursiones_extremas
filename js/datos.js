/*
 * DOCUMENTACIÓN - datos.js (base de datos SIMULADA en el navegador)
 *
 * Mientras no exista el backend, este archivo hace de "base de datos": guarda las
 * mismas 11 tablas del diseño (usuarios, excursiones, pedidos, etc.) en localStorage
 * bajo la clave "vertigo_db". Lo usan el sitio público y el panel admin, por eso
 * lo que se compra en el sitio aparece en el panel y lo que se crea en el panel
 * aparece en el sitio.
 *
 * CÓMO SE USA
 *   Datos.tabla('excursiones')              -> lista completa de una tabla
 *   Datos.buscar('usuarios', 3)             -> una fila por id
 *   Datos.insertar('paises', {nombre:'X'})  -> agrega (asigna id solo) y la devuelve
 *   Datos.actualizar('paises', 3, {...})    -> modifica campos de una fila
 *   Datos.eliminar('paises', 3)             -> borra una fila
 *   Datos.login(email, password)            -> usuario o null
 *   Datos.registrar({...})                  -> crea un cliente (o devuelve {error})
 *   Datos.sesion() / Datos.cerrarSesion()   -> usuario logueado
 *   Datos.crearPedido({...})                -> arma pedido + items (+ pago)
 *   Datos.reiniciar()                       -> vuelve a los datos de ejemplo
 *
 * CUANDO HAYA BACKEND (PHP + MySQL)
 *   Cada función de este archivo se reemplaza por una llamada a un archivo PHP
 *   (por ejemplo login.php, pedidos.php). Los nombres de tablas y campos son los
 *   mismos del diseño de la base, así que las pantallas casi no cambian.
 *
 * NOTA: las contraseñas se guardan tal cual (simplificación del trabajo).
 */
(function () {
  'use strict';

  var CLAVE = 'vertigo_db';
  var CLAVE_SESION = 'vertigo_sesion';
  var ESTADO = { PENDIENTE: 1, PAGADA: 2, CANCELADA: 3 };
  var ROL = { ADMIN: 1, CLIENTE: 2 };

  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ---------- datos de ejemplo (equivalen a los INSERT iniciales) ----------
  function semilla() {
    var db = {
      roles: [{ id: 1, nombre: 'admin' }, { id: 2, nombre: 'cliente' }],
      estados_pedido: [{ id: 1, nombre: 'pendiente' }, { id: 2, nombre: 'pagada' }, { id: 3, nombre: 'cancelada' }],
      tipos_excursion: ['Rafting', 'Trekking', 'Buceo', 'Rapel y Escalada', 'Parapente', 'Ciclismo de Montaña', 'Kitesurf']
        .map(function (n, i) { return { id: i + 1, nombre: n }; }),
      paises: ['Argentina', 'Italia', 'Alemania', 'Estados Unidos', 'Vietnam']
        .map(function (n, i) { return { id: i + 1, nombre: n }; }),
      provincias: [
        { id: 1, nombre: 'San Juan', pais_id: 1 }, { id: 2, nombre: 'Mendoza', pais_id: 1 },
        { id: 3, nombre: 'Sicilia', pais_id: 2 }, { id: 4, nombre: 'Brandeburgo', pais_id: 3 },
        { id: 5, nombre: 'California', pais_id: 4 }, { id: 6, nombre: 'Arizona', pais_id: 4 },
        { id: 7, nombre: 'Gia Lai', pais_id: 5 }
      ],
      ciudades: [
        { id: 1, nombre: 'San Juan', provincia_id: 1 }, { id: 2, nombre: 'Mendoza', provincia_id: 2 },
        { id: 3, nombre: 'Palermo', provincia_id: 3 }, { id: 4, nombre: 'Potsdam', provincia_id: 4 },
        { id: 5, nombre: 'San Francisco', provincia_id: 5 }, { id: 6, nombre: 'Flagstaff', provincia_id: 6 },
        { id: 7, nombre: 'Pleiku', provincia_id: 7 }
      ],
      usuarios: [
        { id: 1, nombre: 'Admin', apellido: 'Vertigo', email: 'admin@vertigo.com', password: 'admin123', telefono: '', dni: '', ciudad_id: 1, rol_id: 1, activo: 1 },
        { id: 2, nombre: 'Ana', apellido: 'Gómez', email: 'ana@mail.com', password: '1234', telefono: '2644111222', dni: '30111222', ciudad_id: 1, rol_id: 2, activo: 1 },
        { id: 3, nombre: 'Luis', apellido: 'Pérez', email: 'luis@mail.com', password: '1234', telefono: '2644333444', dni: '28999888', ciudad_id: 2, rol_id: 2, activo: 1 },
        { id: 4, nombre: 'Sofía', apellido: 'Díaz', email: 'sofia@mail.com', password: '1234', telefono: '2644555666', dni: '35222111', ciudad_id: 1, rol_id: 2, activo: 1 },
        { id: 5, nombre: 'Marcos', apellido: 'Ruiz', email: 'marcos@mail.com', password: '1234', telefono: '', dni: '33444555', ciudad_id: 2, rol_id: 2, activo: 1 }
      ],
      // Los nombres y precios coinciden con las tarjetas de tour.html
      excursiones: [
        { id: 1, nombre: 'Kitesurf, Italia', descripcion: 'Jornada de kitesurf en la costa de Sicilia, con instructor y equipo.', tipo_excursion_id: 7, ciudad_id: 3, precio: 200, capacidad: 20, fecha_salida: '2026-12-10', imagen: 'images/destination-1.jpg', activa: 1 },
        { id: 2, nombre: 'Rapel, Alemania', descripcion: 'Descenso en rapel por paredes de Brandeburgo, apto para principiantes.', tipo_excursion_id: 4, ciudad_id: 4, precio: 200, capacidad: 15, fecha_salida: '2026-12-15', imagen: 'images/destination-2.jpg', activa: 1 },
        { id: 3, nombre: 'Parapente, EEUU', descripcion: 'Vuelo biplaza en parapente sobre la bahía de San Francisco.', tipo_excursion_id: 5, ciudad_id: 5, precio: 200, capacidad: 12, fecha_salida: '2027-01-08', imagen: 'images/destination-3.jpg', activa: 1 },
        { id: 4, nombre: 'Buceo, Italia', descripcion: 'Inmersión guiada en aguas de Palermo con certificación incluida.', tipo_excursion_id: 3, ciudad_id: 3, precio: 200, capacidad: 10, fecha_salida: '2027-01-20', imagen: 'images/destination-4.jpg', activa: 1 },
        { id: 5, nombre: 'Trekking, EEUU', descripcion: 'Caminata de dos días por los cañones de Arizona.', tipo_excursion_id: 2, ciudad_id: 6, precio: 200, capacidad: 16, fecha_salida: '2027-02-05', imagen: 'images/destination-5.jpg', activa: 1 },
        { id: 6, nombre: 'Rafting, Vietnam', descripcion: 'Descenso de rápidos en el río de Gia Lai, con guías locales.', tipo_excursion_id: 1, ciudad_id: 7, precio: 200, capacidad: 14, fecha_salida: '2027-02-18', imagen: 'images/destination-6.jpg', activa: 1 }
      ],
      pedidos: [], pedido_items: [], pagos: []
    };

    // Pedidos de ejemplo repartidos en los últimos meses, para que el panel tenga datos
    var ejemplos = [
      // [usuario, [[excursion, personas]...], estado, meses atrás, día, marca, últimos4]
      [2, [[1, 2]], 2, 5, 12, 'Visa', '4242'], [3, [[2, 1], [4, 1]], 2, 5, 20, 'Mastercard', '4444'],
      [4, [[3, 2]], 2, 4, 8, 'Visa', '1111'], [5, [[6, 3]], 2, 4, 22, 'Visa', '1111'],
      [2, [[5, 2]], 2, 3, 5, 'Visa', '4242'], [3, [[1, 2], [6, 2]], 2, 3, 18, 'Mastercard', '4444'],
      [4, [[4, 2]], 3, 2, 3, '', ''], [5, [[2, 3]], 2, 2, 14, 'Visa', '1111'],
      [2, [[3, 1]], 2, 1, 9, 'Visa', '4242'], [3, [[5, 2]], 2, 1, 25, 'Mastercard', '4444'],
      [4, [[1, 3], [2, 2]], 2, 0, 2, 'Visa', '1111'], [5, [[4, 2]], 1, 0, 4, '', '']
    ];
    var hoy = new Date();
    ejemplos.forEach(function (e, i) {
      var fecha = new Date(hoy.getFullYear(), hoy.getMonth() - e[3], e[4], 10, 30);
      if (fecha > hoy) fecha = new Date(hoy.getTime() - 3600 * 1000 * (i + 1));
      var total = 0, id = db.pedidos.length + 1;
      e[1].forEach(function (it) {
        var ex = db.excursiones[it[0] - 1];
        total += ex.precio * it[1];
        db.pedido_items.push({ id: db.pedido_items.length + 1, pedido_id: id, excursion_id: it[0], personas: it[1], precio_unitario: ex.precio });
      });
      db.pedidos.push({ id: id, codigo: 'VT-' + (1000 + id) + 'X', usuario_id: e[0], creado_por: null, estado_id: e[2], total: total, creado_en: fecha.toISOString() });
      if (e[5]) db.pagos.push({ id: db.pagos.length + 1, pedido_id: id, marca: e[5], ultimos4: e[6], monto: total, aprobado: 1, motivo: null, creado_en: fecha.toISOString() });
    });
    return db;
  }

  // ---------- almacenamiento ----------
  var db = null;

  function cargar() {
    try { var s = localStorage.getItem(CLAVE); if (s) return JSON.parse(s); } catch (e) { /* sin acceso */ }
    return null;
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch (e) { /* modo privado */ }
  }
  db = cargar();
  if (!db) { db = semilla(); guardar(); }

  // Si otra pestaña modificó los datos, se recarga el estado en memoria
  window.addEventListener('storage', function (e) { if (e.key === CLAVE) db = cargar() || db; });
  function fresco() { var d = cargar(); if (d) db = d; }

  var Datos = {
    ESTADO: ESTADO, ROL: ROL, slug: slug,

    // ----- operaciones básicas sobre una tabla -----
    tabla: function (n) { fresco(); return db[n].slice(); },
    buscar: function (n, id) { fresco(); return db[n].filter(function (f) { return f.id === Number(id); })[0] || null; },
    insertar: function (n, fila) {
      fresco();
      var max = db[n].reduce(function (m, f) { return Math.max(m, f.id); }, 0);
      fila.id = max + 1;
      db[n].push(fila); guardar(); return fila;
    },
    actualizar: function (n, id, cambios) {
      fresco();
      var f = db[n].filter(function (x) { return x.id === Number(id); })[0];
      if (f) { Object.keys(cambios).forEach(function (k) { f[k] = cambios[k]; }); guardar(); }
      return f || null;
    },
    eliminar: function (n, id) {
      fresco();
      db[n] = db[n].filter(function (x) { return x.id !== Number(id); }); guardar();
    },
    reiniciar: function () { db = semilla(); guardar(); },

    // ----- sesión y cuentas -----
    login: function (email, password) {
      fresco();
      email = String(email).trim().toLowerCase();
      var u = db.usuarios.filter(function (x) { return x.email.toLowerCase() === email && x.password === password && x.activo; })[0];
      if (!u) return null;
      try { localStorage.setItem(CLAVE_SESION, JSON.stringify({ id: u.id })); } catch (e) { /* ignorar */ }
      return u;
    },
    // Devuelve el usuario logueado (fila completa de la tabla usuarios) o null
    sesion: function () {
      try {
        var s = JSON.parse(localStorage.getItem(CLAVE_SESION));
        return s ? Datos.buscar('usuarios', s.id) : null;
      } catch (e) { return null; }
    },
    cerrarSesion: function () { try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* ignorar */ } },
    esAdmin: function (u) { return !!u && u.rol_id === ROL.ADMIN; },
    // Crea una cuenta de cliente. Valida que el email no esté usado.
    registrar: function (d) {
      fresco();
      var email = String(d.email).trim().toLowerCase();
      if (db.usuarios.some(function (x) { return x.email.toLowerCase() === email; })) return { error: 'Ya existe una cuenta con ese email.' };
      var u = Datos.insertar('usuarios', {
        nombre: d.nombre, apellido: d.apellido, email: email, password: d.password,
        telefono: d.telefono || '', dni: d.dni || '', ciudad_id: d.ciudad_id || null,
        rol_id: d.rol_id || ROL.CLIENTE, activo: 1
      });
      return { usuario: u };
    },

    // ----- consultas combinadas (equivalen a JOIN) -----
    ciudadCompleta: function (id) {
      var c = Datos.buscar('ciudades', id); if (!c) return '';
      var p = Datos.buscar('provincias', c.provincia_id);
      var pa = p ? Datos.buscar('paises', p.pais_id) : null;
      return c.nombre + (p ? ', ' + p.nombre : '') + (pa ? ' (' + pa.nombre + ')' : '');
    },
    nombreDe: function (tabla, id) { var f = Datos.buscar(tabla, id); return f ? f.nombre : ''; },
    nombreUsuario: function (id) { var u = Datos.buscar('usuarios', id); return u ? u.nombre + ' ' + u.apellido : ''; },
    excursionPorSlug: function (s) {
      return Datos.tabla('excursiones').filter(function (e) { return slug(e.nombre) === s; })[0] || null;
    },
    // Lugares ocupados = personas en pedidos que no están cancelados
    ocupados: function (excursionId) {
      fresco();
      var vivos = {};
      db.pedidos.forEach(function (p) { if (p.estado_id !== ESTADO.CANCELADA) vivos[p.id] = true; });
      return db.pedido_items.reduce(function (s, it) {
        return s + (it.excursion_id === Number(excursionId) && vivos[it.pedido_id] ? it.personas : 0);
      }, 0);
    },
    libres: function (excursionId) {
      var e = Datos.buscar('excursiones', excursionId);
      return e ? Math.max(0, e.capacidad - Datos.ocupados(excursionId)) : 0;
    },
    itemsDe: function (pedidoId) {
      fresco();
      return db.pedido_items.filter(function (i) { return i.pedido_id === pedidoId; });
    },
    pagosDe: function (pedidoId) {
      fresco();
      return db.pagos.filter(function (p) { return p.pedido_id === pedidoId; });
    },

    /*
     * Crea un pedido completo (pedido + items + pago opcional).
     * datos = { usuario_id, creado_por, estado_id, items:[{excursion_id, personas}], pago:{marca,ultimos4} }
     * El total y los precios se calculan ACÁ con los precios de la tabla excursiones
     * (nunca se confía en lo que manda la pantalla). Lanza Error si no hay lugares.
     */
    crearPedido: function (datos) {
      fresco();
      var total = 0;
      datos.items.forEach(function (it) {
        var ex = Datos.buscar('excursiones', it.excursion_id);
        if (!ex || !ex.activa) throw new Error('La excursión ya no está disponible.');
        if (it.personas > Datos.libres(ex.id)) throw new Error('No quedan lugares suficientes en "' + ex.nombre + '" (libres: ' + Datos.libres(ex.id) + ').');
        total += ex.precio * it.personas;
      });
      var ahora = new Date().toISOString();
      var codigo = 'VT-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);
      var pedido = Datos.insertar('pedidos', {
        codigo: codigo, usuario_id: datos.usuario_id, creado_por: datos.creado_por || null,
        estado_id: datos.estado_id || ESTADO.PENDIENTE, total: total, creado_en: ahora
      });
      datos.items.forEach(function (it) {
        var ex = Datos.buscar('excursiones', it.excursion_id);
        Datos.insertar('pedido_items', { pedido_id: pedido.id, excursion_id: ex.id, personas: it.personas, precio_unitario: ex.precio });
      });
      if (datos.pago) {
        Datos.insertar('pagos', { pedido_id: pedido.id, marca: datos.pago.marca, ultimos4: datos.pago.ultimos4, monto: total, aprobado: 1, motivo: null, creado_en: ahora });
      }
      return pedido;
    },
    // Registra un intento de pago rechazado sobre un pedido ya existente
    registrarPagoRechazado: function (pedidoId, marca, ultimos4, monto, motivo) {
      return Datos.insertar('pagos', { pedido_id: pedidoId, marca: marca, ultimos4: ultimos4, monto: monto, aprobado: 0, motivo: motivo, creado_en: new Date().toISOString() });
    }
  };

  window.Datos = Datos;
})();
