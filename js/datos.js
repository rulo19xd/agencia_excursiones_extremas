/*
 * DOCUMENTACIÓN - datos.js (conexión con la base de datos MySQL "vertigo" a través de PHP)
 *
 * Antes este archivo simulaba la base en localStorage. Ahora la base real vive en MySQL y
 * este archivo habla con los PHP de la carpeta api/. Las pantallas (login, checkout, mis
 * reservas, panel de administración) siguen usando EXACTAMENTE los mismos nombres:
 *
 *   Datos.tabla('excursiones')              -> lista completa de una tabla
 *   Datos.buscar('usuarios', 3)             -> una fila por id
 *   Datos.insertar('paises', {nombre:'X'})  -> agrega (solo administradores) y devuelve la fila
 *   Datos.actualizar('paises', 3, {...})    -> modifica campos de una fila (solo administradores)
 *   Datos.eliminar('paises', 3)             -> borra una fila (solo administradores)
 *   Datos.login(email, password)            -> usuario o null
 *   Datos.registrar({...})                  -> crea un cliente (o devuelve {error})
 *   Datos.sesion() / Datos.cerrarSesion()   -> usuario logueado
 *   Datos.crearPedido({...})                -> arma pedido + items (+ pago)
 *   Datos.recargar()                        -> vuelve a pedir los datos al servidor
 *   Datos.cancelarPedido(id) / puedeCancelar(pedido)   -> cancelación (con reembolso)
 *   Datos.registrarCobro({...}) / cobradoDe(id) / saldoDe(id)   -> cobros
 *   Datos.recuperarPassword(email, dato, pass) / subirImagen(file)
 *
 * CÓMO FUNCIONA
 *   1. Al cargar la página se pide api/snapshot.php: una "foto" de las tablas que el
 *      usuario actual puede ver (un visitante ve los catálogos y las excursiones activas;
 *      un cliente, además, sus reservas; un administrador, todo). Esa foto queda en memoria
 *      y las lecturas (tabla, buscar, itemsDe...) se resuelven ahí, sin más pedidos.
 *   2. Cada escritura (insertar, actualizar, eliminar, crearPedido, login...) va al
 *      servidor y, si salió bien, se pide una foto nueva para que todo quede al día.
 *   3. El servidor es quien decide: valida permisos, precios, lugares disponibles y
 *      contraseñas. Lo que valida la pantalla es solo comodidad para el usuario.
 *
 * Las llamadas son SINCRÓNICAS a propósito: así el resto del sitio no cambia. El navegador
 * muestra un aviso de "sync XHR deprecated" en la consola; es esperable. Si más adelante se
 * quiere pasar a fetch() asincrónico, este es el único archivo donde está concentrado.
 *
 * REQUISITO: abrir el sitio por http://localhost/... (Apache de XAMPP). Si se abre el HTML
 * con doble clic (file://) el PHP no corre y aparece un cartel rojo arriba de la página.
 */
(function () {
  'use strict';

  var ESTADO = { PENDIENTE: 1, PAGADA: 2, CANCELADA: 3 };
  var ROL = { ADMIN: 1, CLIENTE: 2 };
  // Nombres que usan las pantallas para los estados (el panel y "Mis reservas" comparan con estos)
  var NOMBRE_ESTADO = { 1: 'pendiente', 2: 'pagada', 3: 'cancelada' };

  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ---------- dónde está la API ----------
  // datos.js está en <sitio>/js/, la API en <sitio>/api/. Se calcula a partir de la
  // dirección de este mismo script, así funciona igual desde index.html que desde dashboard/.
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) {
      var todos = document.getElementsByTagName('script');
      for (var i = todos.length - 1; i >= 0; i--) {
        if (/datos\.js(\?|$)/.test(todos[i].src)) { s = todos[i]; break; }
      }
    }
    return new URL('../api/', s ? s.src : location.href).href;
  })();

  // Dirección de una imagen guardada en la base de datos (la sirve api/imagen.php)
  // ancho (opcional): 400, 800 o 1280 pide una versión liviana; sin ancho, la foto original.
  function urlImagenDb(id, ancho) { return BASE + 'imagen.php?id=' + encodeURIComponent(id) + (ancho ? '&w=' + ancho : ''); }

  // Foto de una excursión en el ancho pedido: de la base (con su versión liviana) o, si no tiene, la ruta del sitio.
  function imagenDe(ex, ancho) {
    return ex && ex.imagen_id ? urlImagenDb(ex.imagen_id, ancho) : ((ex && ex.imagen) || '');
  }

  // Datos viejos del simulador: ya no se usan, se limpian para no dejar basura en el navegador
  try { localStorage.removeItem('vertigo_db'); localStorage.removeItem('vertigo_sesion'); } catch (e) { /* ignorar */ }

  // ---------- comunicación con el servidor ----------
  function ErrorApi(mensaje, estado) {
    this.name = 'ErrorApi';
    this.message = mensaje;
    this.estado = estado;
  }
  ErrorApi.prototype = Object.create(Error.prototype);

  // Hace un pedido SINCRÓNICO. Sin "cuerpo" es un GET; con cuerpo, un POST con JSON.
  // Devuelve el JSON de la respuesta o lanza ErrorApi (con el mensaje que mandó el servidor).
  function pedir(archivo, cuerpo) {
    var post = cuerpo !== undefined;
    var xhr = new XMLHttpRequest();
    xhr.open(post ? 'POST' : 'GET', BASE + archivo, false);   // false = sincrónico
    var esForm = post && typeof FormData !== 'undefined' && cuerpo instanceof FormData;
    if (post && !esForm) xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.send(post ? (esForm ? cuerpo : JSON.stringify(cuerpo)) : null);
    } catch (e) {
      throw new ErrorApi('No se pudo conectar con el servidor. Abrí el sitio desde http://localhost/ y verificá que Apache y MySQL estén encendidos en XAMPP.', 0);
    }
    var json;
    try {
      json = JSON.parse(xhr.responseText);
    } catch (e) {
      throw new ErrorApi('El servidor respondió algo inesperado (' + xhr.status + '): ' + String(xhr.responseText).replace(/<[^>]*>/g, ' ').trim().slice(0, 200), xhr.status);
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new ErrorApi((json && json.error) || ('Error ' + xhr.status), xhr.status);
    }
    return json;
  }

  // Cartel rojo fijo arriba cuando no hay conexión con el servidor
  function cartelError(mensaje) {
    function poner() {
      var c = document.getElementById('vertigo-sin-servidor');
      if (!c) {
        c = document.createElement('div');
        c.id = 'vertigo-sin-servidor';
        c.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c53030;color:#fff;padding:10px 16px;font:14px/1.4 sans-serif;text-align:center';
        document.body.appendChild(c);
      }
      c.textContent = mensaje;
    }
    if (document.body) poner(); else document.addEventListener('DOMContentLoaded', poner);
  }

  // ---------- la "foto" en memoria ----------
  function vacio() {
    return {
      roles: [], estados_pedido: [], tipos_excursion: [], paises: [], provincias: [], ciudades: [],
      usuarios: [], excursiones: [], pedidos: [], pedido_items: [], pagos: []
    };
  }

  var db = vacio();
  var ocupadosPorExcursion = {};
  var usuarioSesion = null;

  function recargar() {
    try {
      var r = pedir('snapshot.php');
      var nueva = vacio();
      Object.keys(nueva).forEach(function (t) { if (Array.isArray(r.db[t])) nueva[t] = r.db[t]; });
      // Las fotos de las excursiones están DENTRO de la base (tabla imagenes). El servidor manda solo el
      // imagen_id; acá se arma la dirección completa (api/imagen.php?id=...) en el campo "imagen", así
      // todas las pantallas la usan como cualquier otra ruta. La ruta original (por si la excursión usa una
      // imagen del sitio) queda en ruta_imagen.
      nueva.excursiones = nueva.excursiones.map(function (e) {
        e.ruta_imagen = e.imagen;
        if (e.imagen_id) e.imagen = urlImagenDb(e.imagen_id);
        return e;
      });
      // el servidor guarda 'Pagado'/'Cancelado'...; las pantallas esperan 'pagada'/'cancelada'
      nueva.estados_pedido = nueva.estados_pedido.map(function (e) {
        return { id: e.id, nombre: NOMBRE_ESTADO[e.id] || String(e.nombre).toLowerCase() };
      });
      db = nueva;
      ocupadosPorExcursion = r.ocupados || {};
      usuarioSesion = r.sesion || null;
      var c = document.getElementById('vertigo-sin-servidor');
      if (c) c.remove();
      return true;
    } catch (e) {
      db = vacio(); ocupadosPorExcursion = {}; usuarioSesion = null;
      cartelError(e.message);
      return false;
    }
  }
  recargar();

  // Escribe en el servidor. Si falla, avisa con el motivo y corta (así la pantalla no
  // muestra "Guardado" cuando no se guardó). Si sale bien, actualiza la foto.
  function escribir(archivo, cuerpo) {
    var r;
    try { r = pedir(archivo, cuerpo); }
    catch (e) { alert(e.message); throw e; }
    recargar();
    return r;
  }

  var Datos = {
    ESTADO: ESTADO, ROL: ROL, slug: slug,
    recargar: recargar,

    // ----- lectura (desde la foto en memoria) -----
    tabla: function (n) { return (db[n] || []).slice(); },
    buscar: function (n, id) {
      return (db[n] || []).filter(function (f) { return f.id === Number(id); })[0] || null;
    },

    // ----- escritura (solo administradores; el servidor lo verifica) -----
    insertar: function (n, fila) {
      return escribir('crud.php', { tabla: n, accion: 'insertar', datos: fila }).fila;
    },
    actualizar: function (n, id, cambios) {
      return escribir('crud.php', { tabla: n, accion: 'actualizar', id: Number(id), datos: cambios }).fila;
    },
    eliminar: function (n, id) {
      escribir('crud.php', { tabla: n, accion: 'eliminar', id: Number(id) });
    },
    // Ya no hay datos de ejemplo que restaurar: solo vuelve a pedir los datos al servidor.
    reiniciar: function () { recargar(); },

    // ----- sesión y cuentas -----
    // Devuelve el usuario si el email y la contraseña son correctos, o null si no.
    login: function (email, password) {
      try {
        var r = pedir('login.php', { email: String(email).trim(), password: password });
        recargar();
        return r.usuario;
      } catch (e) {
        if (e.estado !== 401) alert(e.message);   // 401 = credenciales incorrectas (lo avisa la pantalla)
        return null;
      }
    },
    // Devuelve el usuario logueado (sin contraseña) o null
    sesion: function () { return usuarioSesion; },
    cerrarSesion: function () {
      try { pedir('logout.php', {}); } catch (e) { /* si no hay conexión, igual se limpia lo local */ }
      recargar();
    },
    esAdmin: function (u) { return !!u && u.rol_id === ROL.ADMIN; },
    // Crea una cuenta de cliente. El servidor valida todo (incluido que el email no esté usado).
    registrar: function (d) {
      try {
        var r = pedir('registro.php', {
          nombre: d.nombre, apellido: d.apellido, email: d.email, password: d.password,
          telefono: d.telefono || '', dni: d.dni || ''
        });
        return { usuario: r.usuario };
      } catch (e) {
        return { error: e.message };
      }
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
    // Lugares ocupados = personas en pedidos que no están cancelados (lo calcula el servidor)
    ocupados: function (excursionId) { return Number(ocupadosPorExcursion[excursionId]) || 0; },
    libres: function (excursionId) {
      var e = Datos.buscar('excursiones', excursionId);
      return e ? Math.max(0, e.capacidad - Datos.ocupados(excursionId)) : 0;
    },
    itemsDe: function (pedidoId) {
      return db.pedido_items.filter(function (i) { return i.pedido_id === pedidoId; });
    },
    pagosDe: function (pedidoId) {
      return db.pagos.filter(function (p) { return p.pedido_id === pedidoId; });
    },

    /*
     * Crea un pedido completo (pedido + items + pago opcional).
     * datos = { usuario_id, estado_id, items:[{excursion_id, personas}], pago:{marca,ultimos4} }
     * El servidor calcula el total con los precios de la tabla excursiones, verifica que
     * haya lugares y decide a nombre de quién queda (un cliente solo puede comprar para sí
     * mismo). Lanza Error con el motivo si no se pudo (las pantallas ya lo muestran).
     */
    crearPedido: function (datos) {
      var r;
      try {
        r = pedir('pedido.php', {
          usuario_id: datos.usuario_id,
          estado_id: datos.estado_id || ESTADO.PENDIENTE,
          items: datos.items,
          pago: datos.pago || null
        });
      } catch (e) {
        throw new Error(e.message);
      }
      recargar();
      return r.pedido;
    },

    // ----- cobros -----
    // Lo cobrado de un pedido (los reembolsos son pagos con monto negativo, así que restan).
    cobradoDe: function (pedidoId) {
      return Datos.pagosDe(pedidoId).reduce(function (t, g) { return t + (g.aprobado ? Number(g.monto) : 0); }, 0);
    },
    // Lo que falta cobrar (nunca negativo; un pedido cancelado no debe nada)
    saldoDe: function (pedidoId) {
      var p = Datos.buscar('pedidos', pedidoId);
      if (!p || p.estado_id === ESTADO.CANCELADA) return 0;
      return Math.max(0, Number(p.total) - Datos.cobradoDe(pedidoId));
    },
    // Registra un cobro (solo administrador). c = { pedido_id, metodo, monto, nota }
    registrarCobro: function (c) {
      var r;
      try { r = pedir('cobro.php', c); } catch (e) { throw new Error(e.message); }
      recargar();
      return r;
    },

    // ----- cancelación -----
    // ¿El cliente todavía puede cancelar? (misma regla que el servidor: no cancelada y
    // todas las salidas a más de DIAS_MINIMOS día(s)). Es solo para mostrar/ocultar el botón.
    DIAS_MINIMOS_PARA_CANCELAR: 1,
    puedeCancelar: function (pedido) {
      if (!pedido || pedido.estado_id === ESTADO.CANCELADA) return false;
      var d = new Date(); d.setDate(d.getDate() + Datos.DIAS_MINIMOS_PARA_CANCELAR);
      var limite = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      return Datos.itemsDe(pedido.id).every(function (i) {
        var e = Datos.buscar('excursiones', i.excursion_id);
        return !!e && e.fecha_salida >= limite;
      });
    },
    // Cancela una reserva. Devuelve { pedido, reembolso }. Lanza Error con el motivo.
    cancelarPedido: function (id) {
      var r;
      try { r = pedir('cancelar.php', { pedido_id: Number(id) }); } catch (e) { throw new Error(e.message); }
      recargar();
      return r;
    },

    // ----- recuperar contraseña (sin correo: se verifica con el DNI o el teléfono) -----
    recuperarPassword: function (email, dato, password) {
      try { pedir('recuperar.php', { email: email, dato: dato, password: password }); return { ok: true }; }
      catch (e) { return { error: e.message }; }
    },

    // ----- imágenes (solo administrador) -----
    // Dirección completa de una imagen guardada en la base de datos (por su id)
    urlImagenDb: urlImagenDb,
    imagenDe: imagenDe,

    // Sube un archivo (File) a la base de datos (tabla imagenes) y devuelve { id, nombre, tamano }.
    // El id se guarda en la excursión (campo imagen_id).
    subirImagen: function (archivo) {
      var f = new FormData(); f.append('imagen', archivo);
      try { return pedir('subir_imagen.php', f); } catch (e) { throw new Error(e.message); }
    }
  };

  window.Datos = Datos;
})();
