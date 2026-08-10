// Sincronización automática de proveedores para Electro Roun.
//
// - Hace una conciliación completa a las 08:15 de Argentina y controles
//   incrementales cada hora, de 09:00 a 18:00 (lunes a sábado).
// - Los controles horarios consultan sólo registros cuyo updatedAt cambió y
//   aplican un delta dentro de Supabase; no descargan el catálogo completo.
// - Toma precio y stock publicados por Mega Electro y Electro Impacto.
// - Calcula el precio de venta con la misma fórmula de calculadora.html.
// - Nunca borra productos: cuando se agotan, los oculta; cuando vuelven,
//   los muestra nuevamente.
// - Conserva intactos todos los productos cargados manualmente.
// - Mega Boutique, Perfumes y Relojes quedan excluidos.

const PARSE_URL = "https://ecured.ecunegocio.com/parse/classes";
const PARSE_APP_ID = "Ecu_Al@2019o_0708777z8A31qProt";

let SUPABASE_URL = "";
let SUPABASE_KEY = "";
let DOLAR_PROVEEDORES = 1590;
const VENTANA_SOLAPADA_MS = 5 * 60 * 1000;
const PRIMERA_VENTANA_INCREMENTAL_MS = 26 * 60 * 60 * 1000;
const ID_CONTROL_INCREMENTAL = "proveedores_sync_incremental";

function configurarEntorno(env = {}) {
  SUPABASE_URL = env.SUPABASE_URL || "";
  SUPABASE_KEY =
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_ANON_KEY ||
    "";
  const cotizacion = Number(env.DOLAR_PROVEEDORES);
  DOLAR_PROVEEDORES =
    Number.isFinite(cotizacion) && cotizacion > 0 ? cotizacion : 1590;
}

const PROVEEDORES = [
  {
    clave: "mega",
    nombre: "Mega Electro",
    owner: "KIpPe9qXMa",
    minimoEsperado: 10,
    categoriasExcluidas: new Set([
      "MEGA BOUTIQUE",
      "PERFUMES",
      "RELOJES",
    ]),
  },
  {
    clave: "impacto",
    nombre: "Electro Impacto",
    owner: "P9ovvzhWkx",
    minimoEsperado: 10,
    categoriasExcluidas: new Set(),
  },
];

const POST_KEYS = [
  "objectId",
  "titulo",
  "codigo",
  "precio",
  "stock",
  "sin_stock",
  "subcategory",
  "subcate",
  "image",
  "imageThumb",
  "mostrar_catalogo",
  "updatedAt",
  "body",
].join(",");

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoPlanoProveedor(texto) {
  return String(texto || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&aacute;|&#225;/gi, "á")
    .replace(/&eacute;|&#233;/gi, "é")
    .replace(/&iacute;|&#237;/gi, "í")
    .replace(/&oacute;|&#243;/gi, "ó")
    .replace(/&uacute;|&#250;/gi, "ú")
    .replace(/&ntilde;|&#241;/gi, "ñ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Los proveedores no envían un campo de moneda. En sus catálogos, los importes
// menores a 1.000 son dólares; algunos equipos de más valor lo aclaran en la
// descripción. El límite de 5.000 evita convertir descripciones viejas cuando
// el producto ya tiene un precio normal expresado en pesos.
function monedaPrecioProveedor(producto) {
  const precio = Number(producto && producto.precio);
  const texto = normalizar(
    textoPlanoProveedor(
      `${producto && producto.titulo ? producto.titulo : ""} ${
        producto && producto.body ? producto.body : ""
      }`,
    ),
  );
  const marcaUSD =
    /(?:^|[^A-Z0-9])(?:USD|U\$S|US\$)(?:$|[^A-Z0-9])/.test(texto) ||
    /\d\s*(?:USD|U\$S|US\$)(?:$|[^A-Z0-9])/.test(texto) ||
    /\bPRECIOS?\s*(?:EN)?\s*DOLAR(?:ES)?\b/.test(texto) ||
    /\bPRECIOS?\b.{0,45}\bDOLAR(?:ES)?\b/.test(texto) ||
    /\bDOLAR(?:ES)?\b.{0,45}\bPRECIOS?\b/.test(texto);

  if (Number.isFinite(precio) && precio > 0 && precio < 1000) return "USD";
  if (
    Number.isFinite(precio) &&
    precio > 0 &&
    precio <= 5000 &&
    marcaUSD
  )
    return "USD";
  return "ARS";
}

function categoriaAmarango(categoriaProveedor, nombreProducto) {
  const texto = normalizar(
    `${categoriaProveedor || ""} ${nombreProducto || ""}`,
  );

  if (/SMART TV|TELEVISION|TELEVISOR|\bTV\b|PROYECTOR|MONITOR/.test(texto))
    return "📺 TV y video";
  if (/PARLANTE|TORRE|EQUIPO DE MUSICA|AURICULAR|AUDIO/.test(texto))
    return "🔊 Audio";
  if (/HELADER|FREEZER|CONGELADOR|EXHIBIDOR|CERVECER/.test(texto))
    return "❄️ Refrigeración";
  if (
    /AIRE ACONDICIONADO|SPLIT|CALEFACCION|ESTUFA|CALOVENTOR|PANEL CALEFACTOR|VENTILADOR|TURBO|CIRCULADOR|TERMOTANQUE|CALEFON/.test(
      texto,
    )
  )
    return "🌡️ Climatización";
  if (/LAVARROP|LAVASECARROP|LAVAVAJILL/.test(texto)) return "🧺 Lavado";
  if (/ASPIRADOR|LIMPIEZA|MOPA|HIDROLAV|ENCERADORA/.test(texto))
    return "🧹 Limpieza";
  if (/COCINA|HORNO|ANAFE|MICROONDAS|CAMPANA|HORNALLA/.test(texto))
    return "🍳 Cocción";
  if (/COLCHON|SOMMIER/.test(texto)) return "🛏️ Colchones y sommiers";
  if (
    /BLANQUERIA|SABANA|ACOLCHADO|ALMOHADA|MANTA|EDREDON|TOALLA|FRAZADA/.test(
      texto,
    )
  )
    return "🧵 Blanquería";
  if (/MUEBLE|MESA|SILLA|SILLON|PLACARD|ROPERO/.test(texto))
    return "🪑 Muebles";
  if (/CAMPING|CARPA|JARDINERIA|PILETA|GAZEBO/.test(texto))
    return "⛺ Camping y aire libre";
  if (/BICICLETA|FITNESS|DEPORTE|MONOPATIN/.test(texto))
    return "🚲 Deportes y movilidad";
  if (/CARGADOR|CABLE USB|POWER BANK|FUNDA|VIDRIO TEMPLADO|TARJETA SD/.test(texto))
    return "🔌 Cargadores y accesorios";
  if (/NOTEBOOK|COMPUTACION|COMPUTADORA|TABLET|IMPRESORA|MONITOR|CAMARA/.test(texto))
    return "💻 Informática";
  if (/HERRAMIENTA|TALADRO|AMOLADORA|SIERRA/.test(texto))
    return "🔧 Herramientas";
  if (/JUGUETE|INFANTIL|MUÑECA/.test(texto)) return "🧸 Juguetes";
  if (/BEBE|BEBES|CUNA|COCHECITO/.test(texto)) return "👶 Bebés";
  if (
    /BELLEZA|CUIDADO PERSONAL|SALUD|NEBULIZADOR|TENSIOMETRO|TERMOMETRO|SECADOR|PLANCHITA|CORTABARBA|MAQUINA DE PELO/.test(
      texto,
    )
  )
    return "💄 Cuidado personal y salud";
  if (/BAZAR|VAJILLA|VASO|OLLA|SARTEN|TERMO|MATE/.test(texto))
    return "🍺 Bazar y mesa";
  if (/CONSOLA|GAMING|VIDEOJUEGO/.test(texto)) return "🎮 Gaming";
  if (/DECORACION|HOGAR Y DECO/.test(texto)) return "🏠 Hogar y deco";
  if (/AUTO|MOTO|AUTOMOTOR/.test(texto)) return "🚗 Autos y motos";
  if (/MASCOTA|PERRO|GATO|COMEDERO|BEBEDERO/.test(texto))
    return "🐶 Mascotas";
  if (/GENERADOR|GRUPO ELECTROGENO|PANEL SOLAR|UPS|INVERSOR/.test(texto))
    return "🔋 Energía";
  if (/PEQUENOS? ELECTRO|ELECTRODOMESTICO/.test(texto))
    return "⚡ Pequeños electro";

  return "📦 Otros";
}

function markupVenta(costo) {
  let multiplicador;
  if (costo <= 50000) multiplicador = 1.8;
  else if (costo <= 100000) multiplicador = 1.6;
  else if (costo <= 250000) multiplicador = 1.5;
  else if (costo <= 350000) multiplicador = 1.4;
  else multiplicador = 1.3;
  return Math.round((costo * multiplicador) / 500) * 500;
}

function fotoProducto(producto) {
  const imagenes = Array.isArray(producto.image) ? producto.image : [];
  const principal = imagenes.find((item) => item && item.url);
  if (principal) return principal.url;
  if (producto.imageThumb && producto.imageThumb.url)
    return producto.imageThumb.url;
  return "";
}

async function parseGet(clase, where, keys, skip = 0) {
  const url = new URL(`${PARSE_URL}/${clase}`);
  url.searchParams.set("where", JSON.stringify(where));
  url.searchParams.set("limit", "1000");
  url.searchParams.set("skip", String(skip));
  if (keys) url.searchParams.set("keys", keys);

  const respuesta = await fetch(url, {
    headers: { "X-Parse-Application-Id": PARSE_APP_ID },
  });
  if (!respuesta.ok) {
    throw new Error(`Proveedor ${clase}: HTTP ${respuesta.status}`);
  }

  const data = await respuesta.json();
  if (!Array.isArray(data.results)) {
    throw new Error(`Proveedor ${clase}: respuesta inválida`);
  }
  return data.results;
}

async function parseTodos(clase, where, keys) {
  const todos = [];
  let skip = 0;
  while (true) {
    const pagina = await parseGet(clase, where, keys, skip);
    todos.push(...pagina);
    if (pagina.length < 1000) break;
    skip += pagina.length;
    if (skip > 20000) throw new Error(`Proveedor ${clase}: demasiados datos`);
  }
  return todos;
}

async function bajarProveedor(proveedor) {
  const [categorias, productos] = await Promise.all([
    parseTodos(
      "Subcategory",
      { owner: proveedor.owner },
      "objectId,name,mostrar_tienda",
    ),
    parseTodos(
      "Post",
      {
        owner_post: proveedor.owner,
        mostrar_catalogo: true,
        stock: { $gt: 0 },
        sin_stock: { $ne: true },
      },
      POST_KEYS,
    ),
  ]);

  if (!categorias.length) {
    throw new Error(`${proveedor.nombre}: no se recibieron categorías`);
  }
  if (productos.length < proveedor.minimoEsperado) {
    throw new Error(
      `${proveedor.nombre}: cantidad sospechosa (${productos.length})`,
    );
  }

  const categoriasPorId = new Map(
    categorias.map((categoria) => [categoria.objectId, categoria.name || ""]),
  );

  const disponibles = productos
    .map((producto) => {
      const categoriaId = producto.subcategory?.objectId || "";
      const categoriaNombre = categoriasPorId.get(categoriaId) || "";
      return { producto, categoriaNombre };
    })
    .filter(({ producto, categoriaNombre }) => {
      const costo = Number(producto.precio);
      if (!producto.objectId || !String(producto.titulo || "").trim()) return false;
      if (!Number.isFinite(costo) || costo <= 0) return false;
      return !proveedor.categoriasExcluidas.has(normalizar(categoriaNombre));
    });

  if (disponibles.length < proveedor.minimoEsperado) {
    throw new Error(
      `${proveedor.nombre}: quedaron muy pocos productos (${disponibles.length})`,
    );
  }

  return {
    proveedor,
    recibidos: productos.length,
    excluidos: productos.length - disponibles.length,
    disponibles,
  };
}

function fechaParse(iso) {
  return { __type: "Date", iso };
}

async function bajarProveedorIncremental(proveedor, desdeISO) {
  // No filtramos stock ni mostrar_catalogo en Parse: un producto que acaba de
  // agotarse o que el proveedor quitó del catálogo también debe llegar como
  // novedad para poder ocultarlo en Amarango.
  const [categorias, productos] = await Promise.all([
    parseTodos(
      "Subcategory",
      { owner: proveedor.owner },
      "objectId,name,mostrar_tienda",
    ),
    parseTodos(
      "Post",
      {
        owner_post: proveedor.owner,
        updatedAt: { $gt: fechaParse(desdeISO) },
      },
      POST_KEYS,
    ),
  ]);

  const categoriasPorId = new Map(
    categorias.map((categoria) => [categoria.objectId, categoria.name || ""]),
  );
  const cambios = [];

  for (const producto of productos) {
    if (!producto || !producto.objectId) continue;
    const categoriaId = producto.subcategory?.objectId || "";
    const categoriaNombre = categoriasPorId.get(categoriaId) || "";
    const nombre = String(producto.titulo || "").trim();
    const precioProveedorOriginal = Number(producto.precio);
    const stock = Number(producto.stock) || 0;
    const excluido = proveedor.categoriasExcluidas.has(
      normalizar(categoriaNombre),
    );
    const disponible =
      producto.mostrar_catalogo === true &&
      producto.sin_stock !== true &&
      stock > 0 &&
      nombre &&
      Number.isFinite(precioProveedorOriginal) &&
      precioProveedorOriginal > 0 &&
      !excluido;

    if (!disponible) {
      cambios.push({
        accion: "ocultar",
        proveedorClave: proveedor.clave,
        proveedorId: producto.objectId,
        proveedorStock: 0,
        visible: false,
        sinStock: true,
        estadoProveedor: "sin_stock",
      });
      continue;
    }

    const monedaProveedor = monedaPrecioProveedor(producto);
    const cotizacionDolar =
      monedaProveedor === "USD" ? DOLAR_PROVEEDORES : 0;
    const costo =
      monedaProveedor === "USD"
        ? Math.round(precioProveedorOriginal * cotizacionDolar)
        : Math.round(precioProveedorOriginal);
    const foto = fotoProducto(producto);
    const categoriaProveedor = categoriaAmarango(categoriaNombre, nombre);
    const cambio = {
      accion: "upsert",
      automaticoProveedor: true,
      proveedor: proveedor.nombre,
      proveedorClave: proveedor.clave,
      proveedorId: producto.objectId,
      proveedorCodigo: String(producto.codigo || ""),
      nombre,
      costo,
      venta: markupVenta(costo),
      precioProveedorOriginal,
      monedaProveedor,
      categoriaProveedor,
      categoria: categoriaProveedor,
      proveedorCategoria: categoriaNombre,
      proveedorStock: stock,
      visible: true,
      sinStock: false,
      estadoProveedor: "disponible",
    };
    if (foto) {
      cambio.fotoProveedor = foto;
      cambio.foto = foto;
    }
    if (monedaProveedor === "USD") {
      cambio.cotizacionDolar = cotizacionDolar;
      cambio.usdConvertido = true;
    }
    cambios.push(cambio);
  }

  return {
    proveedor,
    desde: desdeISO,
    recibidos: productos.length,
    cambios,
  };
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRpc(nombre, parametros = {}) {
  const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(parametros),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(
      `Supabase RPC ${nombre}: HTTP ${respuesta.status}${
        detalle ? ` - ${detalle.slice(0, 300)}` : ""
      }`,
    );
  }
  const texto = await respuesta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

async function leerFilaControl(id) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tienda_catalogo`);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("select", "datos,actualizado");
  url.searchParams.set("limit", "1");
  const respuesta = await fetch(url, { headers: supabaseHeaders() });
  if (!respuesta.ok) {
    throw new Error(`Supabase control ${id}: HTTP ${respuesta.status}`);
  }
  const filas = await respuesta.json();
  return filas[0] || null;
}

async function adquirirSingleFlight(token, tipo) {
  const resultado = await supabaseRpc("amarango_sync_adquirir_lock", {
    p_token: token,
    p_tipo: tipo,
    p_ttl_segundos: 15 * 60,
  });
  return resultado === true || resultado?.adquirido === true;
}

async function liberarSingleFlight(token) {
  await supabaseRpc("amarango_sync_liberar_lock", { p_token: token });
}

async function aplicarDeltaIncremental(token, cambios, fechaISO) {
  return supabaseRpc("amarango_catalogo_aplicar_delta", {
    p_token: token,
    p_cambios: cambios,
    p_fecha: fechaISO,
  });
}

async function leerCatalogo() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tienda_catalogo`);
  url.searchParams.set("id", "eq.catalogo");
  url.searchParams.set("select", "datos,actualizado");
  url.searchParams.set("limit", "1");

  const respuesta = await fetch(url, { headers: supabaseHeaders() });
  if (!respuesta.ok) {
    throw new Error(`Supabase lectura: HTTP ${respuesta.status}`);
  }
  const filas = await respuesta.json();
  const fila = filas[0];
  if (!fila || !Array.isArray(fila.datos)) {
    throw new Error("Supabase: no se encontró el catálogo");
  }
  return fila;
}

async function upsertFila(id, datos) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tienda_catalogo`);
  url.searchParams.set("on_conflict", "id");
  const respuesta = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      id,
      datos,
      actualizado: new Date().toISOString(),
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Supabase guardado ${id}: HTTP ${respuesta.status}`);
  }
}

async function actualizarCatalogoSiNoCambio(fila, productos) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/tienda_catalogo`);
  url.searchParams.set("id", "eq.catalogo");
  url.searchParams.set("actualizado", `eq.${fila.actualizado}`);
  url.searchParams.set("select", "id");

  const respuesta = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      datos: productos,
      actualizado: new Date().toISOString(),
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Supabase actualización: HTTP ${respuesta.status}`);
  }
  const filas = await respuesta.json();
  return Array.isArray(filas) && filas.length === 1;
}

// Únicos campos que determinan si existe un cambio comercial real.
//
// Se comparan de forma explícita precio, stock, moneda, cotización, nombre,
// categoría, imagen y todos los estados de visibilidad/ocultamiento. También se
// incluyen las identidades de proveedor y los metadatos de duplicados porque
// cualquiera de ellos puede cambiar qué producto ve el cliente.
//
// No se comparan campos puramente temporales como:
// - ultimaSincronizacionProveedor
// - proveedorActualizado
// - precioActualizado
// - creado
//
// Los cambios funcionales que representan esos timestamps ya quedan cubiertos
// por los campos estables de esta lista. Así una ejecución sin cambios no
// invalida la caché del catálogo.
const CAMPOS_COMPARACION_CATALOGO = Object.freeze([
  "id",
  "automaticoProveedor",
  "proveedor",
  "proveedorClave",
  "proveedorId",
  "proveedorCodigo",
  "nombre",
  "costo",
  "venta",
  "precioProveedorOriginal",
  "monedaProveedor",
  "cotizacionDolar",
  "cotizacionDolarManual",
  "categoria",
  "categoriaProveedor",
  "categoriaManualProveedor",
  "categoriaManualFijada",
  "proveedorCategoria",
  "foto",
  "fotoProveedor",
  "fotoManualProveedor",
  "fotoOrigen",
  "fotoCatalogoLogo",
  "proveedorStock",
  "visible",
  "sinStock",
  "estadoProveedor",
  "ocultoManualProveedor",
  "ocultoPorDuplicado",
  "duplicadoGrupo",
  "duplicadoPreferido",
  "duplicadoGrupoIgnorado",
]);

function valorComparable(producto, campo) {
  if (
    !producto ||
    !Object.prototype.hasOwnProperty.call(producto, campo) ||
    typeof producto[campo] === "undefined"
  ) {
    return null;
  }
  const valor = producto[campo];
  if (typeof valor === "number" && !Number.isFinite(valor)) return null;
  return valor;
}

function compararCatalogos(catalogoActual, catalogoSiguiente) {
  const actual = Array.isArray(catalogoActual) ? catalogoActual : [];
  const siguiente = Array.isArray(catalogoSiguiente) ? catalogoSiguiente : [];
  const cambiosPorCampo = {};
  const indicesCambiados = new Set();
  const total = Math.max(actual.length, siguiente.length);

  if (actual.length !== siguiente.length) {
    cambiosPorCampo.cantidadProductos = Math.abs(
      actual.length - siguiente.length,
    );
  }

  for (let indice = 0; indice < total; indice++) {
    const productoActual = actual[indice];
    const productoSiguiente = siguiente[indice];

    if (!productoActual || !productoSiguiente) {
      indicesCambiados.add(indice);
      continue;
    }

    for (const campo of CAMPOS_COMPARACION_CATALOGO) {
      const antes = valorComparable(productoActual, campo);
      const despues = valorComparable(productoSiguiente, campo);
      if (JSON.stringify(antes) !== JSON.stringify(despues)) {
        cambiosPorCampo[campo] = (cambiosPorCampo[campo] || 0) + 1;
        indicesCambiados.add(indice);
      }
    }
  }

  const camposCambiados = Object.keys(cambiosPorCampo);
  return {
    hayCambios: camposCambiados.length > 0,
    cantidadAnterior: actual.length,
    cantidadSiguiente: siguiente.length,
    productosCambiados: indicesCambiados.size,
    camposCambiados,
    cambiosPorCampo,
  };
}

function claveProveedor(proveedor, idExterno) {
  return `${proveedor}|${idExterno}`;
}

const PALABRAS_DUPLICADO_IGNORAR = new Set([
  "DE",
  "DEL",
  "LA",
  "EL",
  "LOS",
  "LAS",
  "PARA",
  "Y",
  "EN",
  "MOD",
  "MODELO",
  "NUEVO",
  "NUEVA",
]);

const PALABRAS_DUPLICADO_GENERICAS = new Set([
  "SMART",
  "TV",
  "TELEVISOR",
  "HELADERA",
  "FREEZER",
  "LAVARROPAS",
  "ASPIRADORA",
  "COCINA",
  "HORNO",
  "ANAFE",
  "MICROONDAS",
  "TERMOTANQUE",
  "AIRE",
  "ACONDICIONADO",
  "PARLANTE",
  "TORRE",
  "AURICULAR",
  "AURICULARES",
  "FREIDORA",
  "MIXER",
  "BICICLETA",
  "TALADRO",
  "SET",
  "COMBO",
  "ELECTRICO",
  "ELECTRICA",
  "AUTOMATICO",
  "AUTOMATICA",
  "SEMIAUTOMATICO",
  "SEMIAUTOMATICA",
  "INVERTER",
  "DIGITAL",
]);

function tokensDuplicado(nombre) {
  const texto = normalizar(nombre)
    .replace(/\bSTELAR\b/g, "ESTELAR")
    .replace(/(\d+)\s*(?:LTS?|LITROS?)\b/g, "$1L")
    .replace(/(\d+)\s*(?:KGS?|KILOS?)\b/g, "$1KG")
    .replace(/(\d+)\s*(?:PULGADAS?|PULG)\b/g, "$1")
    .replace(/[^A-Z0-9]+/g, " ");
  return [
    ...new Set(
      texto
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !PALABRAS_DUPLICADO_IGNORAR.has(token)),
    ),
  ];
}

function firmaNumerica(tokens) {
  return tokens
    .filter((token) => /\d/.test(token))
    .sort()
    .join("|");
}

function modelosProducto(tokens) {
  return tokens.filter(
    (token) =>
      token.length >= 3 &&
      /[A-Z]/.test(token) &&
      /\d/.test(token) &&
      !/^\d+(?:L|LT|LTR|KG|W|V|CM|MM|RPM|P|PIEZAS?)$/.test(token) &&
      !/^(?:R|X)\d+$/.test(token),
  );
}

function tokensDistintivos(tokens) {
  return tokens.filter(
    (token) =>
      !PALABRAS_DUPLICADO_GENERICAS.has(token) &&
      !/^\d+$/.test(token) &&
      !/^\d+(?:L|LT|LTR|KG|W|V|CM|MM|RPM|P|PIEZAS?)$/.test(token) &&
      !/^(?:R|X)\d+$/.test(token),
  );
}

function datosProductoDuplicado(producto) {
  const tokens = tokensDuplicado(producto.nombre);
  return {
    producto,
    tokens,
    firmaNumerica: firmaNumerica(tokens),
    modelos: modelosProducto(tokens),
    distintivos: tokensDistintivos(tokens),
    firmaExacta: tokens.slice().sort().join("|"),
  };
}

function puntajeSimilitudProducto(a, b, datosA, datosB) {
  if (!a || !b || !a.nombre || !b.nombre) return 0;

  const preparadoA = datosA || datosProductoDuplicado(a);
  const preparadoB = datosB || datosProductoDuplicado(b);
  const tokensA = preparadoA.tokens;
  const tokensB = preparadoB.tokens;
  if (!tokensA.length || !tokensB.length) return 0;

  const firmaA = preparadoA.firmaNumerica;
  const firmaB = preparadoB.firmaNumerica;
  if ((firmaA || firmaB) && firmaA !== firmaB) return 0;

  const modelosA = preparadoA.modelos;
  const modelosB = preparadoB.modelos;
  if (
    modelosA.length &&
    modelosB.length &&
    !modelosA.some((modelo) => modelosB.includes(modelo))
  )
    return 0;

  const setB = new Set(tokensB);
  const comunes = tokensA.filter((token) => setB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union ? comunes / union : 0;
  const exacto = preparadoA.firmaExacta === preparadoB.firmaExacta;
  const compartenModelo =
    modelosA.length &&
    modelosB.length &&
    modelosA.some((modelo) => modelosB.includes(modelo));
  const mismaCategoria = a.categoria === b.categoria;
  const distintivosB = new Set(preparadoB.distintivos);
  const distintivosComunes = preparadoA.distintivos.filter((token) =>
    distintivosB.has(token),
  ).length;

  if (exacto) return 1;
  if (compartenModelo && comunes >= 2) return Math.max(0.9, jaccard);
  if (
    mismaCategoria &&
    distintivosComunes >= 1 &&
    comunes >= 3 &&
    jaccard >= 0.72
  )
    return jaccard;
  return 0;
}

function claveProductoDuplicado(producto) {
  if (producto.automaticoProveedor) {
    return claveProveedor(producto.proveedorClave, producto.proveedorId);
  }
  return `manual|${String(producto.id)}`;
}

function idGrupoDuplicado(productos) {
  const base = productos
    .map(claveProductoDuplicado)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dup_${(hash >>> 0).toString(36)}`;
}

function aplicarDuplicadosProveedores(catalogo) {
  const candidatos = catalogo.filter(
    (producto) =>
      producto &&
      producto.nombre &&
      producto.sinStock !== true,
  );
  const ocultosIntencionales = new Set(
    candidatos.filter(
      (producto) =>
        producto.visible === false &&
        producto.ocultoPorDuplicado !== true &&
        producto.sinStock !== true,
    ),
  );

  catalogo.forEach((producto) => {
    if (!producto) return;
    delete producto.duplicadoGrupo;
    delete producto.duplicadoCantidad;
    delete producto.duplicadoSimilitud;
    if (producto.ocultoPorDuplicado) {
      producto.visible =
        producto.sinStock !== true && producto.ocultoManualProveedor !== true;
      delete producto.ocultoPorDuplicado;
    }
  });

  const padres = candidatos.map((_, indice) => indice);
  const buscar = (indice) => {
    while (padres[indice] !== indice) {
      padres[indice] = padres[padres[indice]];
      indice = padres[indice];
    }
    return indice;
  };
  const unir = (a, b) => {
    const raizA = buscar(a);
    const raizB = buscar(b);
    if (raizA !== raizB) padres[raizB] = raizA;
  };
  const similitudes = new Map();
  const preparados = candidatos.map(datosProductoDuplicado);
  const buckets = new Map();
  const agregarBucket = (clave, indice) => {
    if (!clave) return;
    if (!buckets.has(clave)) buckets.set(clave, []);
    buckets.get(clave).push(indice);
  };
  preparados.forEach((datos, indice) => {
    agregarBucket(`exacto|${datos.firmaExacta}`, indice);
    datos.modelos.forEach((modelo) =>
      agregarBucket(`modelo|${modelo}`, indice),
    );
    datos.distintivos.forEach((token) =>
      agregarBucket(
        `similar|${datos.producto.categoria || ""}|${
          datos.firmaNumerica
        }|${token}`,
        indice,
      ),
    );
  });

  const pares = new Set();
  for (const indices of buckets.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const menor = Math.min(indices[a], indices[b]);
        const mayor = Math.max(indices[a], indices[b]);
        pares.add(`${menor}|${mayor}`);
      }
    }
  }

  for (const par of pares) {
    const [i, j] = par.split("|").map(Number);
    const similitud = puntajeSimilitudProducto(
      candidatos[i],
      candidatos[j],
      preparados[i],
      preparados[j],
    );
    if (similitud > 0) {
      unir(i, j);
      similitudes.set(par, similitud);
    }
  }

  const grupos = new Map();
  candidatos.forEach((producto, indice) => {
    const raiz = buscar(indice);
    if (!grupos.has(raiz)) grupos.set(raiz, []);
    grupos.get(raiz).push({ producto, indice });
  });

  let gruposDetectados = 0;
  let productosOcultos = 0;
  for (const miembros of grupos.values()) {
    if (miembros.length < 2) continue;
    const productos = miembros.map((miembro) => miembro.producto);
    const grupoId = idGrupoDuplicado(productos);
    const grupoIgnorado = productos.some(
      (producto) => producto.duplicadoGrupoIgnorado === grupoId,
    );
    if (grupoIgnorado) {
      productos.forEach((producto) => {
        producto.duplicadoGrupoIgnorado = grupoId;
        delete producto.duplicadoGrupo;
        delete producto.duplicadoCantidad;
        delete producto.duplicadoSimilitud;
        delete producto.duplicadoPreferido;
        delete producto.ocultoPorDuplicado;
        if (
          producto.sinStock !== true &&
          producto.ocultoManualProveedor !== true &&
          !ocultosIntencionales.has(producto)
        )
          producto.visible = true;
      });
      continue;
    }
    gruposDetectados++;
    let preferido = productos.find(
      (producto) =>
        producto.duplicadoPreferido === true &&
        producto.ocultoManualProveedor !== true &&
        !ocultosIntencionales.has(producto),
    );
    if (!preferido) {
      preferido = productos
        .filter(
          (producto) =>
            producto.visible !== false &&
            producto.ocultoManualProveedor !== true &&
            !ocultosIntencionales.has(producto),
        )
        .sort(
          (a, b) =>
            Number(Boolean(a.automaticoProveedor)) -
              Number(Boolean(b.automaticoProveedor)) ||
            Number(Boolean(b.foto)) - Number(Boolean(a.foto)) ||
            Number(a.venta || Infinity) - Number(b.venta || Infinity),
        )[0];
    }
    if (!preferido) {
      preferido = productos
        .filter(
          (producto) =>
            producto.ocultoManualProveedor !== true &&
            !ocultosIntencionales.has(producto),
        )
        .slice()
        .sort(
          (a, b) =>
            Number(Boolean(a.automaticoProveedor)) -
              Number(Boolean(b.automaticoProveedor)) ||
            Number(Boolean(b.foto)) - Number(Boolean(a.foto)) ||
            Number(a.venta || Infinity) - Number(b.venta || Infinity),
        )[0];
    }

    productos.forEach((producto) => {
      producto.duplicadoGrupo = grupoId;
      producto.duplicadoCantidad = productos.length;
      producto.duplicadoSimilitud = Math.max(
        ...miembros
          .filter((otro) => otro.producto !== producto)
          .map((otro) => {
            const propio = miembros.find(
              (miembro) => miembro.producto === producto,
            ).indice;
            const a = Math.min(propio, otro.indice);
            const b = Math.max(propio, otro.indice);
            return similitudes.get(`${a}|${b}`) || 0;
          }),
      );
      if (producto === preferido) {
        producto.duplicadoPreferido = true;
        producto.ocultoPorDuplicado = false;
        producto.visible = true;
      } else {
        producto.duplicadoPreferido = false;
        producto.ocultoPorDuplicado =
          producto.ocultoManualProveedor !== true &&
          !ocultosIntencionales.has(producto);
        producto.visible = false;
        productosOcultos++;
      }
    });
  }

  return { gruposDetectados, productosOcultos };
}

function fusionarCatalogo(catalogoActual, resultados, fechaISO) {
  const ahora = Date.now();
  const siguienteResumen = {};
  let proximoId = Math.min(
    0,
    ...catalogoActual
      .map((producto) => Number(producto && producto.id))
      .filter(Number.isFinite),
  ) - 1;

  const catalogo = catalogoActual.map((producto) => ({ ...producto }));
  const indice = new Map();
  catalogo.forEach((producto) => {
    if (
      producto &&
      producto.automaticoProveedor &&
      producto.proveedorClave &&
      producto.proveedorId
    ) {
      indice.set(
        claveProveedor(producto.proveedorClave, producto.proveedorId),
        producto,
      );
    }
  });

  for (const resultado of resultados) {
    const { proveedor, disponibles } = resultado;
    let nuevos = 0;
    let actualizados = 0;
    let ocultos = 0;
    let usdConvertidos = 0;
    const ocultosManuales = new Set();

    // Primero suponemos que los automáticos de este proveedor se agotaron.
    // Los que sigan disponibles se restauran en el paso siguiente.
    catalogo.forEach((producto) => {
      if (
        producto &&
        producto.automaticoProveedor &&
        producto.proveedorClave === proveedor.clave
      ) {
        if (
          producto.visible === false &&
          producto.sinStock !== true &&
          producto.ocultoPorDuplicado !== true
        ) {
          ocultosManuales.add(
            claveProveedor(producto.proveedorClave, producto.proveedorId),
          );
        }
        if (producto.visible !== false || producto.sinStock !== true) ocultos++;
        producto.visible = false;
        producto.sinStock = true;
        producto.proveedorStock = 0;
        producto.estadoProveedor = "sin_stock";
        producto.ultimaSincronizacionProveedor = fechaISO;
      }
    });

    for (const item of disponibles) {
      const fuente = item.producto;
      const llave = claveProveedor(proveedor.clave, fuente.objectId);
      let producto = indice.get(llave);
      const precioProveedorOriginal = Number(fuente.precio);
      const monedaProveedor = monedaPrecioProveedor(fuente);
      const cotizacionManual = Number(
        producto && producto.cotizacionDolarManual,
      );
      const cotizacionDolar =
        monedaProveedor === "USD"
          ? Number.isFinite(cotizacionManual) && cotizacionManual > 0
            ? cotizacionManual
            : DOLAR_PROVEEDORES
          : 0;
      const costo =
        monedaProveedor === "USD"
          ? Math.round(precioProveedorOriginal * cotizacionDolar)
          : Math.round(precioProveedorOriginal);
      const venta = markupVenta(costo);
      const foto = fotoProducto(fuente);
      if (monedaProveedor === "USD") usdConvertidos++;

      if (!producto) {
        producto = {
          id: proximoId--,
          creado: ahora,
          visible: true,
          sinStock: false,
        };
        catalogo.push(producto);
        indice.set(llave, producto);
        nuevos++;
      } else {
        actualizados++;
      }

      const precioCambio =
        Math.round(Number(producto.costo || 0)) !== costo ||
        Math.round(Number(producto.venta || 0)) !== venta;
      const ocultoManual = ocultosManuales.has(llave);

      const categoriaProveedor = categoriaAmarango(
        item.categoriaNombre,
        fuente.titulo,
      );

      producto.nombre = String(fuente.titulo || "").trim();
      producto.costo = costo;
      producto.venta = venta;
      producto.visible = !ocultoManual;
      producto.ocultoManualProveedor = ocultoManual;
      producto.sinStock = false;
      producto.categoriaProveedor = categoriaProveedor;
      producto.categoria =
        producto.categoriaManualProveedor || categoriaProveedor;
      if (foto) producto.fotoProveedor = foto;
      if (producto.fotoManualProveedor) {
        producto.foto = producto.fotoManualProveedor;
      } else if (foto) {
        producto.foto = foto;
      }
      producto.precioActualizado = precioCambio
        ? ahora
        : producto.precioActualizado || ahora;
      producto.automaticoProveedor = true;
      producto.proveedor = proveedor.nombre;
      producto.proveedorClave = proveedor.clave;
      producto.proveedorId = fuente.objectId;
      producto.proveedorCodigo = String(fuente.codigo || "");
      producto.proveedorCategoria = item.categoriaNombre || "";
      producto.proveedorStock = Number(fuente.stock) || 0;
      producto.proveedorActualizado = fuente.updatedAt || "";
      producto.ultimaSincronizacionProveedor = fechaISO;
      producto.estadoProveedor = "disponible";
      producto.precioProveedorOriginal = precioProveedorOriginal;
      producto.monedaProveedor = monedaProveedor;
      if (monedaProveedor === "USD") {
        producto.cotizacionDolar = cotizacionDolar;
        producto.usdConvertido = true;
      } else {
        delete producto.cotizacionDolar;
        delete producto.cotizacionDolarManual;
        delete producto.usdConvertido;
      }
    }

    siguienteResumen[proveedor.clave] = {
      nombre: proveedor.nombre,
      recibidos: resultado.recibidos,
      excluidos: resultado.excluidos,
      disponibles: disponibles.length,
      nuevos,
      actualizados,
      ocultos,
      usdConvertidos,
      cotizacionDolar: DOLAR_PROVEEDORES,
    };
  }

  siguienteResumen.duplicados = aplicarDuplicadosProveedores(catalogo);
  return { catalogo, resumen: siguienteResumen };
}

async function ejecutarSincronizacion(env = {}) {
  configurarEntorno(env);
  if (!SUPABASE_KEY) throw new Error("Falta la clave de Supabase");

  const intentos = await Promise.allSettled(PROVEEDORES.map(bajarProveedor));
  const correctos = [];
  const errores = [];

  intentos.forEach((intento, indice) => {
    if (intento.status === "fulfilled") correctos.push(intento.value);
    else {
      errores.push({
        proveedor: PROVEEDORES[indice].nombre,
        error: String(intento.reason?.message || intento.reason),
      });
    }
  });

  if (!correctos.length) {
    throw new Error(`Fallaron todos los proveedores: ${JSON.stringify(errores)}`);
  }

  const fechaISO = new Date().toISOString();
  let ultimoResultado;

  // Si alguien guarda un producto manual justo durante la sincronización,
  // no pisamos su cambio: volvemos a leer y reintentamos la mezcla.
  for (let intento = 1; intento <= 3; intento++) {
    const fila = await leerCatalogo();
    const fusion = fusionarCatalogo(fila.datos, correctos, fechaISO);
    const comparacion = compararCatalogos(fila.datos, fusion.catalogo);

    // Si precio, stock, moneda, cotización, nombre, categoría, imagen y
    // visibilidad siguen iguales, no hacemos respaldo ni PATCH. De esta forma
    // tampoco cambia "actualizado" y los navegadores conservan su caché.
    if (!comparacion.hayCambios) {
      ultimoResultado = {
        ok: errores.length === 0,
        fecha: fechaISO,
        antes: fila.datos.length,
        despues: fusion.catalogo.length,
        actualizoCatalogo: false,
        motivo: "sin_cambios_reales",
        comparacion,
        proveedores: fusion.resumen,
        errores,
      };
      break;
    }

    await upsertFila("catalogo_respaldo_proveedores", {
      fecha: fechaISO,
      cantidad: fila.datos.length,
      productos: fila.datos,
    });

    const guardado = await actualizarCatalogoSiNoCambio(fila, fusion.catalogo);
    if (guardado) {
      ultimoResultado = {
        ok: errores.length === 0,
        fecha: fechaISO,
        antes: fila.datos.length,
        despues: fusion.catalogo.length,
        actualizoCatalogo: true,
        motivo: "cambios_reales",
        comparacion,
        proveedores: fusion.resumen,
        errores,
      };
      break;
    }
  }

  if (!ultimoResultado) {
    throw new Error("El catálogo cambió durante los tres intentos");
  }

  await upsertFila("proveedores_sync", ultimoResultado);
  console.log(`PROVEEDORES_SYNC ${JSON.stringify(ultimoResultado)}`);
  return ultimoResultado;
}

function fechaCursorValida(valor, alternativa) {
  const fecha = new Date(valor || "");
  return Number.isFinite(fecha.getTime()) ? fecha : alternativa;
}

async function ejecutarSincronizacionIncremental(env = {}) {
  configurarEntorno(env);
  if (!SUPABASE_KEY) throw new Error("Falta la clave de Supabase");

  const inicio = new Date();
  const inicioISO = inicio.toISOString();
  const control = await leerFilaControl(ID_CONTROL_INCREMENTAL);
  const datosControl =
    control && control.datos && typeof control.datos === "object"
      ? control.datos
      : {};
  const cursores = { ...(datosControl.cursores || {}) };

  const intentos = await Promise.allSettled(
    PROVEEDORES.map((proveedor) => {
      const respaldo = new Date(inicio.getTime() - PRIMERA_VENTANA_INCREMENTAL_MS);
      const cursor = fechaCursorValida(cursores[proveedor.clave], respaldo);
      const desde = new Date(cursor.getTime() - VENTANA_SOLAPADA_MS);
      return bajarProveedorIncremental(proveedor, desde.toISOString());
    }),
  );
  const correctos = [];
  const errores = [];
  intentos.forEach((intento, indice) => {
    if (intento.status === "fulfilled") correctos.push(intento.value);
    else {
      errores.push({
        proveedor: PROVEEDORES[indice].nombre,
        error: String(intento.reason?.message || intento.reason),
      });
    }
  });
  if (!correctos.length) {
    throw new Error(`Fallaron todos los proveedores: ${JSON.stringify(errores)}`);
  }

  const cambios = correctos.flatMap((resultado) => resultado.cambios);
  let aplicacion = {
    actualizo: false,
    productos_cambiados: 0,
    motivo: "proveedores_sin_novedades",
  };
  if (cambios.length) {
    // El token real se inyecta desde la envoltura single-flight.
    const token = String(env.__AMARANGO_SYNC_TOKEN || "");
    if (!token) throw new Error("Falta el token interno de single-flight");
    aplicacion = await aplicarDeltaIncremental(token, cambios, inicioISO);
  }

  correctos.forEach((resultado) => {
    // Avanzamos el cursor sólo para proveedores cuya consulta terminó bien.
    // La próxima ejecución vuelve cinco minutos hacia atrás y es idempotente.
    cursores[resultado.proveedor.clave] = inicioISO;
  });
  await upsertFila(ID_CONTROL_INCREMENTAL, {
    cursores,
    ultimaEjecucion: inicioISO,
    errores,
  });

  const resultado = {
    ok: errores.length === 0,
    modo: "incremental",
    fecha: inicioISO,
    actualizoCatalogo: Boolean(aplicacion && aplicacion.actualizo),
    cambiosRecibidos: cambios.length,
    aplicacion,
    proveedores: correctos.map((item) => ({
      clave: item.proveedor.clave,
      nombre: item.proveedor.nombre,
      desde: item.desde,
      recibidos: item.recibidos,
      cambios: item.cambios.length,
    })),
    errores,
  };
  await upsertFila("proveedores_sync", resultado);
  console.log(`PROVEEDORES_SYNC_INCREMENTAL ${JSON.stringify(resultado)}`);
  return resultado;
}

function crearTokenSync(tipo) {
  const aleatorio =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${tipo}-${aleatorio}`;
}

async function ejecutarSincronizacionProgramadaSegura(env = {}, tipo = "completa") {
  configurarEntorno(env);
  const token = crearTokenSync(tipo);
  const adquirido = await adquirirSingleFlight(token, tipo);
  if (!adquirido) {
    const omitido = {
      ok: true,
      omitido: true,
      motivo: "otra_sincronizacion_en_curso",
      modo: tipo,
      fecha: new Date().toISOString(),
    };
    console.log(`PROVEEDORES_SYNC_OMITIDA ${JSON.stringify(omitido)}`);
    return omitido;
  }

  const entornoConToken = { ...env, __AMARANGO_SYNC_TOKEN: token };
  try {
    return tipo === "incremental"
      ? await ejecutarSincronizacionIncremental(entornoConToken)
      : await ejecutarSincronizacion(env);
  } finally {
    try {
      await liberarSingleFlight(token);
    } catch (error) {
      console.error(
        `PROVEEDORES_SYNC_LOCK_ERROR ${String(error?.message || error)}`,
      );
    }
  }
}

async function ejecutarSincronizacionSegura(env = {}) {
  try {
    return await ejecutarSincronizacion(env);
  } catch (error) {
    const detalle = {
      ok: false,
      fecha: new Date().toISOString(),
      error: String(error?.message || error),
    };
    console.error(`PROVEEDORES_SYNC_ERROR ${JSON.stringify(detalle)}`);
    try {
      await upsertFila("proveedores_sync", detalle);
    } catch {
      // Si Supabase también falla, el error igualmente queda en los logs.
    }
    throw error;
  }
}

export {
  CAMPOS_COMPARACION_CATALOGO,
  aplicarDuplicadosProveedores,
  bajarProveedor,
  bajarProveedorIncremental,
  compararCatalogos,
  ejecutarSincronizacion,
  ejecutarSincronizacionIncremental,
  ejecutarSincronizacionProgramadaSegura,
  ejecutarSincronizacionSegura,
  fusionarCatalogo,
  markupVenta,
};
