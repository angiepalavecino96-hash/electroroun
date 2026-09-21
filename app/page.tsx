"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id?: string | number; nombre?: string; name?: string; costoManualProveedor?: number; ventaManualProveedor?: number; venta?: number; precio?: number; costo?: number; fotoManualProveedor?: string; foto?: string; imagen?: string; categoria?: string; visible?: boolean; sinStock?: boolean; ocultoManualProducto?: boolean; automaticoProveedor?: boolean; proveedor?: string; proveedorStock?: number; stock?: number };
type View = "catalogo" | "calculadora" | "placas" | "acceso";
type Session = { authenticated: boolean; role?: "vendedor" | "admin"; name?: string };

const SB_URL = "https://bbacudythwqsnxhjfvpy.supabase.co";
const SB_KEY = "sb_publishable_r6IfEyk1BrAOpJMMaPMElg_IufJItdN";

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const round500 = (n: number) => Math.round(n / 500) * 500;
const salePrice = (cost: number) => {
  const margin = cost < 50000 ? .8 : cost <= 100000 ? .6 : cost <= 250000 ? .5 : cost <= 350000 ? .4 : .3;
  return round500(cost * (1 + margin));
};

function normalize(raw: Product) {
  const base = Number(raw.ventaManualProveedor ?? raw.venta ?? raw.precio ?? raw.costo ?? 0);
  return {
    id: String(raw.id ?? raw.nombre ?? raw.name ?? Math.random()),
    name: String(raw.nombre ?? raw.name ?? "Producto"),
    cost: Number(raw.costoManualProveedor ?? raw.costo ?? 0),
    price: base,
    image: raw.fotoManualProveedor ?? raw.foto ?? raw.imagen ?? "",
    category: raw.categoria ?? "Hogar",
    provider: raw.proveedor ?? (raw.automaticoProveedor ? "Proveedor automático" : "Carga manual"),
    stock: Number(raw.proveedorStock ?? raw.stock ?? 0),
    automatic: raw.automaticoProveedor === true,
    outOfStock: raw.sinStock === true,
    hidden: raw.ocultoManualProducto === true || raw.visible === false,
    visible: raw.visible !== false && raw.sinStock !== true,
  };
}

export default function Home() {
  const [view, setView] = useState<View>("catalogo");
  const [products, setProducts] = useState<ReturnType<typeof normalize>[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [cost, setCost] = useState(100000);
  const [sellerCash, setSellerCash] = useState(150000);
  const [plateCash, setPlateCash] = useState(150000);
  const [plateName, setPlateName] = useState("Estufa halógena");
  const [access, setAccess] = useState<"vendedor" | "admin">("vendedor");
  const [adminName, setAdminName] = useState("Marce");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [loginError, setLoginError] = useState("");
  const [detailProduct, setDetailProduct] = useState<ReturnType<typeof normalize> | null>(null);
  const [editProduct, setEditProduct] = useState<ReturnType<typeof normalize> | null>(null);
  const [editCost, setEditCost] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editOutOfStock, setEditOutOfStock] = useState(false);
  const [editHidden, setEditHidden] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("📦 Otros");
  const [newCost, setNewCost] = useState(0);
  const [newPrice, setNewPrice] = useState(0);
  const [newStock, setNewStock] = useState(1);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [consultProduct, setConsultProduct] = useState<ReturnType<typeof normalize> | null>(null);
  const [sharingProductId, setSharingProductId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${SB_URL}/rest/v1/tienda_catalogo?id=eq.catalogo&select=datos,actualizado`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const list = Array.isArray(data?.[0]?.datos) ? data[0].datos : [];
        setProducts(list.map(normalize));
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/session").then(r => r.json()).then(setSession).catch(() => {});
  }, []);

  async function login() {
    setLoginError("");
    const response = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: access, name: access === "admin" ? adminName : "Vendedores", password }) });
    const data = await response.json();
    if (!response.ok) { setLoginError(data.error || "Contraseña incorrecta"); return; }
    setSession(data); setPassword(""); setView("calculadora");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setSession({ authenticated: false }); setView("catalogo");
  }

  function openProtected(next: "calculadora" | "placas") {
    if (!session.authenticated) { setView("acceso"); return; }
    setView(next);
  }

  function whatsappMessage(product: ReturnType<typeof normalize>) {
    const price = product.price ? `\nPrecio contado: ${money(product.price)}\n2 cuotas de ${money(round500(product.price * 1.15 / 2))}\n4 cuotas de ${money(round500(product.price * 1.55 / 4))}\n6 cuotas de ${money(round500(product.price * 1.8 / 6))}` : "";
    return `Hola, quiero consultar por este producto de Electro Roun:\n${product.name}${price}`;
  }

  function shareMessage(product: ReturnType<typeof normalize>) {
    const prices = product.price ? `\n\n💵 Contado: ${money(product.price)}\n💳 2 cuotas de ${money(round500(product.price * 1.15 / 2))}\n💳 4 cuotas de ${money(round500(product.price * 1.55 / 4))}\n💳 6 cuotas de ${money(round500(product.price * 1.8 / 6))}` : "";
    return `⚡ ELECTRO ROUN ⚡\n${product.name}${prices}\n\n🚚 Envíos a domicilio\nConsultanos por disponibilidad.`;
  }

  function openWhatsApp(phone?: string) {
    if (!consultProduct) return;
    const target = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage(consultProduct))}` : `https://wa.me/?text=${encodeURIComponent(whatsappMessage(consultProduct))}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  async function shareWhatsApp(product: ReturnType<typeof normalize>) {
    if (!session.authenticated || !session.role) return;
    setSharingProductId(product.id);
    try {
      if (!product.image) throw new Error("Este producto todavía no tiene una foto para compartir.");
      const response = await fetch(`/api/share-image?id=${encodeURIComponent(product.id)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo preparar la imagen del producto.");
      }
      const blob = await response.blob();
      const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const safeName = product.name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "producto";
      const file = new File([blob], `${safeName}.${extension}`, { type: blob.type || "image/jpeg" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: product.name, text: shareMessage(product), files: [file] });
        return;
      }
      throw new Error("Este dispositivo no permite adjuntar la foto automáticamente. Probalo desde el celular con Chrome actualizado.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(error instanceof Error ? error.message : "No se pudo compartir el producto.");
    } finally {
      setSharingProductId(null);
    }
  }

  function useProductForPlate(product: ReturnType<typeof normalize>) {
    setPlateName(product.name);
    if (session.role === "admin") setCost(product.cost);
    setPlateCash(product.price);
    setDetailProduct(null);
    setView("placas");
  }

  function sharePlate() {
    const text = `⚡ ELECTRO ROUN ⚡\n${plateName}\n\n💵 Contado: ${money(plateSale)}\n💳 2 cuotas de ${money(round500(plateSale * 1.15 / 2))}\n💳 4 cuotas de ${money(round500(plateSale * 1.55 / 4))}\n💳 6 cuotas de ${money(round500(plateSale * 1.8 / 6))}\n\n🚚 Envíos a domicilio\nConsultanos por disponibilidad.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function beginEdit(product: ReturnType<typeof normalize>) {
    setEditProduct(product);
    setEditCost(product.cost);
    setEditPrice(product.price);
    setEditImage(null);
    setEditOutOfStock(product.outOfStock);
    setEditHidden(product.hidden);
    setEditStatus("");
  }

  async function saveProduct() {
    if (!editProduct) return;
    setEditStatus("Guardando cambios…");
    const form = new FormData();
    form.set("id", editProduct.id);
    form.set("cost", String(editCost));
    form.set("price", String(editPrice));
    form.set("outOfStock", String(editOutOfStock));
    form.set("hidden", String(editHidden));
    if (editImage) form.set("image", editImage);
    const response = await fetch("/api/admin/products", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) { setEditStatus(data.error || "No se pudo guardar"); return; }
    const updated = normalize(data.product);
    setProducts(current => current.map(product => product.id === updated.id ? updated : product));
    setEditProduct(null);
    setEditStatus("");
  }

  async function createManualProduct() {
    setNewStatus("Guardando producto…");
    const form = new FormData();
    form.set("action", "create");
    form.set("name", newName);
    form.set("category", newCategory);
    form.set("cost", String(newCost));
    form.set("price", String(newPrice));
    form.set("stock", String(newStock));
    if (newImage) form.set("image", newImage);
    const response = await fetch("/api/admin/products", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) { setNewStatus(data.error || "No se pudo guardar"); return; }
    const created = normalize(data.product);
    setProducts(current => [created, ...current]);
    setNewProductOpen(false);
    setNewName(""); setNewCategory("📦 Otros"); setNewCost(0); setNewPrice(0); setNewStock(1); setNewImage(null); setNewStatus("");
  }

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.filter(p => session.role === "admin" || p.visible).map(p => p.category).filter(Boolean))).sort()], [products, session.role]);
  const filtered = useMemo(() => products.filter(p => (session.role === "admin" || p.visible) && (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 60), [products, query, category, session.role]);
  const cash = session.role === "admin" ? salePrice(cost || 0) : round500(sellerCash || 0);
  const plateSale = session.role === "admin" ? salePrice(cost || 0) : round500(plateCash || 0);
  const installments = [{ n: 2, total: cash * 1.15 }, { n: 4, total: cash * 1.55 }, { n: 6, total: cash * 1.8 }];

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setView("catalogo")}>
          <img src="/electro-roun-logo.png" alt="Electro Roun" />
          <span><b>ELECTRO ROUN</b><small>Energía para tu hogar, soluciones para vos</small></span>
        </button>
        <nav>
          <button className={view === "catalogo" ? "active" : ""} onClick={() => setView("catalogo")}>Catálogo</button>
          {session.authenticated && <button className={view === "calculadora" ? "active" : ""} onClick={() => openProtected("calculadora")}>Calculadora</button>}
          {session.authenticated && <button className={view === "placas" ? "active" : ""} onClick={() => openProtected("placas")}>Placas</button>}
          <button className="access" onClick={() => session.authenticated ? logout() : setView("acceso")}>{session.authenticated ? "Salir" : "Ingresar"}</button>
        </nav>
      </header>

      {view === "catalogo" && <>
        <section className="hero">
          <div><span className="eyebrow">ELECTRODOMÉSTICOS · HOGAR · TECNOLOGÍA</span><h1>Energía para<br/><em>tu hogar.</em></h1><p>Soluciones para vos, con productos seleccionados, atención personalizada y hasta 6 cuotas fijas.</p><div className="hero-actions"><button onClick={() => document.getElementById("catalog")?.scrollIntoView({behavior:"smooth"})}>Ver productos</button>{session.authenticated && <button className="secondary" onClick={() => openProtected("calculadora")}>Calcular cuotas</button>}</div></div>
        </section>
        <section className="benefits"><span>⚡ Actualización automática</span><span>🛡️ Compra segura</span><span>🚚 Envíos a domicilio</span><span>💳 Hasta 6 cuotas</span></section>
        <section id="catalog" className="catalog">
          <div className="section-head"><div><span className="eyebrow">NUESTRO CATÁLOGO</span><h2>Encontrá lo que necesitás</h2></div><div className="catalog-actions">{session.role === "admin" && <button onClick={() => setNewProductOpen(true)}>+ Agregar producto manual</button>}<label>⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto..." /></label></div></div>
          {!loading && products.length > 0 && <div className="categories" aria-label="Categorías de productos">{categories.map(c => <button key={c} className={category === c ? "selected" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>}
          {loading ? <div className="status">Actualizando productos…</div> : filtered.length ? <div className="grid">{filtered.map(p => <article key={p.id} className={`card${!p.visible ? " card-disabled" : ""}`}><div className="photo">{p.image ? <img src={p.image} alt={p.name}/> : <span>ER</span>}</div><small>{p.category}</small><h3>{p.name}</h3>{session.role === "admin" && !p.visible && <span className="stock-badge">{p.outOfStock ? "SIN STOCK" : "OCULTO"}</span>}<b>{p.price ? money(p.price) : "Consultar"}</b><p>{p.price ? `6 cuotas de ${money(round500(p.price * 1.8 / 6))}` : "Pedinos información"}</p><button onClick={() => setDetailProduct(p)}>Ver precio y cuotas</button>{session.authenticated && (session.role === "vendedor" || session.role === "admin") && <button className="share-direct" disabled={sharingProductId === p.id} onClick={() => shareWhatsApp(p)}>{sharingProductId === p.id ? "Preparando foto…" : "Compartir por WhatsApp"}</button>}{session.role === "admin" && <button className="admin-edit" onClick={() => beginEdit(p)}>Editar producto</button>}</article>)}</div> : <div className="status">No hay productos en esta categoría o búsqueda.</div>}
        </section>
      </>}

      {detailProduct && <div className="modal-backdrop" onClick={() => setDetailProduct(null)}><div className="product-modal" role="dialog" aria-modal="true" aria-label={`Detalle de ${detailProduct.name}`} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setDetailProduct(null)}>×</button><div className="product-modal-photo">{detailProduct.image ? <img src={detailProduct.image} alt={detailProduct.name}/> : <span>ER</span>}</div><div className="product-modal-info"><span className="eyebrow">{detailProduct.category}</span><h2>{detailProduct.name}</h2>{detailProduct.price ? <><div className="detail-cash"><small>PRECIO CONTADO</small><strong>{money(detailProduct.price)}</strong></div><div className="detail-installments">{[2,4,6].map(n => { const factor = n === 2 ? 1.15 : n === 4 ? 1.55 : 1.8; return <div key={n}><b>{n} cuotas</b><strong>{money(round500(detailProduct.price * factor / n))}</strong><small>cada una</small></div> })}</div></> : <p>Consultanos para conocer el precio.</p>}{session.authenticated && (session.role === "vendedor" || session.role === "admin") ? <><button className="detail-whatsapp" disabled={sharingProductId === detailProduct.id} onClick={() => shareWhatsApp(detailProduct)}>{sharingProductId === detailProduct.id ? "Preparando foto…" : "Compartir por WhatsApp"}</button><button className="detail-plate" onClick={() => useProductForPlate(detailProduct)}>Usar en generador de placas</button><small className="detail-note">Se comparte la foto vigente, el contado y las cuotas.</small></> : <><button className="detail-whatsapp" onClick={() => { setConsultProduct(detailProduct); setDetailProduct(null); }}>Consultar por WhatsApp</button><small className="detail-note">Elegís con quién hablar en el siguiente paso.</small></>}</div></div></div>}

      {editProduct && session.role === "admin" && <div className="modal-backdrop" onClick={() => setEditProduct(null)}><div className="admin-modal" role="dialog" aria-modal="true" aria-label={`Editar ${editProduct.name}`} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setEditProduct(null)}>×</button><span className="eyebrow">PANEL DE ADMINISTRACIÓN</span><h2>{editProduct.name}</h2><div className="admin-metadata"><div><small>PROVEEDOR</small><b>{editProduct.provider}</b></div><div><small>STOCK INFORMADO</small><b>{editProduct.stock} unidades</b></div><div><small>ORIGEN</small><b>{editProduct.automatic ? "Automático" : "Manual"}</b></div></div><div className="admin-price-grid"><label className="field">Precio de costo<input type="number" value={editCost} onChange={e => setEditCost(Number(e.target.value))}/></label><label className="field">Precio contado<input type="number" value={editPrice} onChange={e => setEditPrice(Number(e.target.value))}/></label></div><label className="image-picker"><span>{editImage ? editImage.name : "Reemplazar imagen"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setEditImage(e.target.files?.[0] || null)}/></label>{!editProduct.automatic && <div className="manual-controls"><label><input type="checkbox" checked={editOutOfStock} onChange={e => setEditOutOfStock(e.target.checked)}/><span><b>Marcar sin stock</b><small>Deja de mostrarse en el catálogo público.</small></span></label><label><input type="checkbox" checked={editHidden} onChange={e => setEditHidden(e.target.checked)}/><span><b>Ocultar producto</b><small>Solo seguirá visible para administradores.</small></span></label></div>}{editStatus && <p className="edit-status">{editStatus}</p>}<button className="primary" onClick={saveProduct}>Guardar cambios</button><small className="admin-note">Los cambios manuales se conservarán en las próximas actualizaciones.</small></div></div>}

      {newProductOpen && session.role === "admin" && <div className="modal-backdrop" onClick={() => setNewProductOpen(false)}><div className="admin-modal" role="dialog" aria-modal="true" aria-label="Agregar producto manual" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setNewProductOpen(false)}>×</button><span className="eyebrow">NUEVO PRODUCTO MANUAL</span><h2>Agregar al catálogo</h2><label className="field">Nombre del producto<input value={newName} onChange={e => setNewName(e.target.value)}/></label><label className="field">Categoría<select value={newCategory} onChange={e => setNewCategory(e.target.value)}>{categories.filter(item => item !== "Todos").map(item => <option key={item}>{item}</option>)}{!categories.includes("📦 Otros") && <option>📦 Otros</option>}</select></label><div className="admin-price-grid"><label className="field">Precio de costo<input type="number" value={newCost} onChange={e => { const value = Number(e.target.value); setNewCost(value); setNewPrice(salePrice(value || 0)); }}/></label><label className="field">Precio contado calculado<input type="number" value={newPrice} onChange={e => setNewPrice(Number(e.target.value))}/></label></div><div className="manual-calculation"><small>CUOTAS CALCULADAS</small><div><span>2 cuotas</span><b>{money(round500(newPrice * 1.15 / 2))}</b></div><div><span>4 cuotas</span><b>{money(round500(newPrice * 1.55 / 4))}</b></div><div><span>6 cuotas</span><b>{money(round500(newPrice * 1.8 / 6))}</b></div></div><label className="field">Stock disponible<input type="number" min="0" value={newStock} onChange={e => setNewStock(Number(e.target.value))}/></label><label className="image-picker"><span>{newImage ? newImage.name : "Agregar imagen (opcional)"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setNewImage(e.target.files?.[0] || null)}/></label>{newStatus && <p className="edit-status">{newStatus}</p>}<button className="primary" onClick={createManualProduct}>Guardar producto manual</button></div></div>}

      {consultProduct && <div className="modal-backdrop" onClick={() => setConsultProduct(null)}><div className="contact-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setConsultProduct(null)}>×</button><img src="/electro-roun-logo.png" alt="Electro Roun"/><span className="eyebrow">CONSULTAR PRODUCTO</span><h2>{consultProduct.name}</h2><p>Elegí con quién querés hablar:</p><button onClick={() => openWhatsApp("5491172356230")}>Consultar con Marce</button><button onClick={() => openWhatsApp("5492271418941")}>Consultar con Cori</button><button className="seller-choice" onClick={() => openWhatsApp()}>Consultar con tu vendedor</button><small>WhatsApp se abrirá con el mensaje del producto preparado.</small></div></div>}

      {view === "calculadora" && session.authenticated && <ToolShell title="Calculadora de precios" subtitle={`Sesión: ${session.name}`}>
        {session.role === "admin" ? <label className="field">Costo del producto<input type="number" value={cost} onChange={e => setCost(Number(e.target.value))}/></label> : <label className="field">Precio contado<input type="number" value={sellerCash} onChange={e => setSellerCash(Number(e.target.value))}/></label>}
        <div className="result-main"><small>PRECIO CONTADO</small><strong>{money(cash)}</strong></div>
        <div className="installments">{installments.map(x => <div key={x.n}><b>{x.n} cuotas</b><strong>{money(round500(x.total / x.n))}</strong><small>por cuota</small></div>)}</div>
        <button className="primary" onClick={() => openProtected("placas")}>Armar placa para compartir</button>
      </ToolShell>}

      {view === "placas" && session.authenticated && <ToolShell title="Generador de placas" subtitle={`Prepará una publicación lista para compartir · ${session.name}`}>
        <label className="field">Nombre del producto<input value={plateName} onChange={e => setPlateName(e.target.value)}/></label>
        {session.role === "admin" ? <label className="field">Precio de costo<input type="number" value={cost} onChange={e => setCost(Number(e.target.value))}/></label> : <label className="field">Precio contado<input type="number" value={plateCash} onChange={e => setPlateCash(Number(e.target.value))}/></label>}
        <div className="plate"><img src="/electro-roun-logo.png" alt=""/><span>OFERTA ELECTRO ROUN</span><h2>{plateName}</h2><strong>{money(plateSale)}</strong><p>o 6 cuotas fijas de {money(round500(plateSale * 1.8 / 6))}</p><footer>ENERGÍA PARA TU HOGAR · SOLUCIONES PARA VOS</footer></div>
        <button className="primary" onClick={sharePlate}>Compartir placa por WhatsApp</button>
      </ToolShell>}

      {view === "acceso" && <ToolShell title="Acceso al equipo" subtitle="Elegí tu tipo de acceso">
        <div className="role-tabs"><button className={access === "vendedor" ? "selected" : ""} onClick={() => setAccess("vendedor")}>Vendedores</button><button className={access === "admin" ? "selected" : ""} onClick={() => setAccess("admin")}>Administrador</button></div>
        {access === "admin" ? <label className="field">Administrador<select value={adminName} onChange={e => setAdminName(e.target.value)}><option>Marce</option><option>Cori</option></select></label> : <div className="shared-access"><b>Acceso general de vendedores</b><span>Un único acceso compartido para todo el equipo.</span></div>}
        <label className="field">Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} placeholder="••••••••" /></label>
        {loginError && <p className="login-error">{loginError}</p>}
        <button className="primary" onClick={login}>Ingresar como {access === "admin" ? "administrador" : "vendedor"}</button><p className="note">Acceso protegido e independiente de AmarangoElectro.</p>
      </ToolShell>}
    </main>
  );
}

function ToolShell({title, subtitle, children}: {title:string; subtitle:string; children:React.ReactNode}) {
  return <section className="tool-page"><div className="tool-card"><div className="tool-logo"><img src="/electro-roun-logo.png" alt="Electro Roun"/></div><span className="eyebrow">ELECTRO ROUN</span><h1>{title}</h1><p>{subtitle}</p><div className="tool-content">{children}</div></div></section>;
}
