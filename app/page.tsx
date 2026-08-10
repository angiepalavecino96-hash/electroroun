"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id?: string | number; nombre?: string; name?: string; precio?: number; costo?: number; foto?: string; imagen?: string; categoria?: string; visible?: boolean; sinStock?: boolean; automaticoProveedor?: boolean };
type View = "catalogo" | "calculadora" | "placas" | "acceso";
type Session = { authenticated: boolean; role?: "vendedor" | "admin"; name?: string };

const SB_URL = "https://zctaukyrhsmpjkcddcqq.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdGF1a3lyaHNtcGprY2RkY3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzQ0ODAsImV4cCI6MjA5NzQxMDQ4MH0.lxhPH9bASIV__jETAwYZvoJmSpk0Q32CJl9tSlQeLdA";

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const round500 = (n: number) => Math.round(n / 500) * 500;
const salePrice = (cost: number) => {
  const margin = cost < 50000 ? .8 : cost <= 100000 ? .6 : cost <= 250000 ? .5 : cost <= 350000 ? .4 : .3;
  return round500(cost * (1 + margin));
};

function normalize(raw: Product) {
  const base = Number(raw.precio ?? raw.costo ?? 0);
  return {
    id: String(raw.id ?? raw.nombre ?? raw.name ?? Math.random()),
    name: String(raw.nombre ?? raw.name ?? "Producto"),
    price: base,
    image: raw.automaticoProveedor ? (raw.foto ?? raw.imagen ?? "") : "",
    category: raw.categoria ?? "Hogar",
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
  const [plateName, setPlateName] = useState("Estufa halógena");
  const [access, setAccess] = useState<"vendedor" | "admin">("vendedor");
  const [adminName, setAdminName] = useState("Marce");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [loginError, setLoginError] = useState("");
  const [consultProduct, setConsultProduct] = useState<ReturnType<typeof normalize> | null>(null);

  useEffect(() => {
    fetch(`${SB_URL}/rest/v1/tienda_catalogo?id=eq.catalogo&select=datos,actualizado`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const list = Array.isArray(data?.[0]?.datos) ? data[0].datos : [];
        setProducts(list.map(normalize).filter((p: ReturnType<typeof normalize>) => p.visible));
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
    const price = product.price ? `\nPrecio: ${money(product.price)}\n6 cuotas de ${money(round500(product.price * 1.8 / 6))}` : "";
    return `Hola, quiero consultar por este producto de Electro Roun:\n${product.name}${price}`;
  }

  function openWhatsApp(phone?: string) {
    if (!consultProduct) return;
    const target = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage(consultProduct))}` : `https://wa.me/?text=${encodeURIComponent(whatsappMessage(consultProduct))}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort()], [products]);
  const filtered = useMemo(() => products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 60), [products, query, category]);
  const cash = salePrice(cost || 0);
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
          <div className="section-head"><div><span className="eyebrow">NUESTRO CATÁLOGO</span><h2>Encontrá lo que necesitás</h2></div><label>⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto..." /></label></div>
          {!loading && products.length > 0 && <div className="categories" aria-label="Categorías de productos">{categories.map(c => <button key={c} className={category === c ? "selected" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>}
          {loading ? <div className="status">Actualizando productos…</div> : filtered.length ? <div className="grid">{filtered.map(p => <article key={p.id} className="card"><div className="photo">{p.image ? <img src={p.image} alt={p.name}/> : <span>ER</span>}</div><small>{p.category}</small><h3>{p.name}</h3><b>{p.price ? money(p.price) : "Consultar"}</b><p>{p.price ? `6 cuotas de ${money(round500(p.price * 1.8 / 6))}` : "Pedinos información"}</p><button onClick={() => setConsultProduct(p)}>Consultar por WhatsApp</button></article>)}</div> : <div className="status">No hay productos en esta categoría o búsqueda.</div>}
        </section>
      </>}

      {consultProduct && <div className="modal-backdrop" onClick={() => setConsultProduct(null)}><div className="contact-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setConsultProduct(null)}>×</button><img src="/electro-roun-logo.png" alt="Electro Roun"/><span className="eyebrow">CONSULTAR PRODUCTO</span><h2>{consultProduct.name}</h2><p>Elegí con quién querés hablar:</p><button onClick={() => openWhatsApp("5491172356230")}>Consultar con Marce</button><button onClick={() => openWhatsApp("5492271418941")}>Consultar con Cori</button><button className="seller-choice" onClick={() => openWhatsApp()}>Consultar con tu vendedor</button><small>WhatsApp se abrirá con el mensaje del producto preparado.</small></div></div>}

      {view === "calculadora" && session.authenticated && <ToolShell title="Calculadora de precios" subtitle={`Sesión: ${session.name}`}>
        <label className="field">Costo del producto<input type="number" value={cost} onChange={e => setCost(Number(e.target.value))}/></label>
        <div className="result-main"><small>PRECIO CONTADO</small><strong>{money(cash)}</strong></div>
        <div className="installments">{installments.map(x => <div key={x.n}><b>{x.n} cuotas</b><strong>{money(round500(x.total / x.n))}</strong><small>por cuota</small></div>)}</div>
        <button className="primary" onClick={() => openProtected("placas")}>Armar placa para compartir</button>
      </ToolShell>}

      {view === "placas" && session.authenticated && <ToolShell title="Generador de placas" subtitle={`Prepará una publicación lista para compartir · ${session.name}`}>
        <label className="field">Nombre del producto<input value={plateName} onChange={e => setPlateName(e.target.value)}/></label>
        <label className="field">Costo<input type="number" value={cost} onChange={e => setCost(Number(e.target.value))}/></label>
        <div className="plate"><img src="/electro-roun-logo.png" alt=""/><span>OFERTA ELECTRO ROUN</span><h2>{plateName}</h2><strong>{money(cash)}</strong><p>o 6 cuotas fijas de {money(round500(cash * 1.8 / 6))}</p><footer>ENERGÍA PARA TU HOGAR · SOLUCIONES PARA VOS</footer></div>
        <button className="primary" onClick={() => window.print()}>Guardar o imprimir placa</button>
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
