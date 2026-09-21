import { readToken } from "../auth";

type CatalogProduct = { id?: string | number; nombre?: string; name?: string; fotoManualProveedor?: string; foto?: string; imagen?: string };
const SB_URL = "https://bbacudythwqsnxhjfvpy.supabase.co";
const SB_KEY = "sb_publishable_r6IfEyk1BrAOpJMMaPMElg_IufJItdN";

export async function GET(request: Request) {
  const session = await readToken(request.headers.get("cookie"));
  if (!session || (session.role !== "vendedor" && session.role !== "admin")) return Response.json({ error: "Acceso no autorizado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta identificar el producto" }, { status: 400 });
  const catalogResponse = await fetch(`${SB_URL}/rest/v1/tienda_catalogo?id=eq.catalogo&select=datos`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" });
  if (!catalogResponse.ok) return Response.json({ error: "No se pudo leer el catálogo" }, { status: 502 });
  const catalog = await catalogResponse.json();
  const products: CatalogProduct[] = Array.isArray(catalog?.[0]?.datos) ? catalog[0].datos : [];
  const product = products.find(item => String(item.id ?? item.nombre ?? item.name ?? "") === id);
  const imageUrl = product?.fotoManualProveedor ?? product?.foto ?? product?.imagen;
  if (!imageUrl) return Response.json({ error: "Este producto no tiene una foto para compartir" }, { status: 404 });
  let parsed: URL;
  try { parsed = new URL(imageUrl); } catch { return Response.json({ error: "La foto del producto no es válida" }, { status: 400 }); }
  if (parsed.protocol !== "https:") return Response.json({ error: "La foto del producto no es segura" }, { status: 400 });
  const imageResponse = await fetch(parsed.toString(), { redirect: "follow" });
  if (!imageResponse.ok || !imageResponse.body) return Response.json({ error: "No se pudo descargar la foto" }, { status: 502 });
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return Response.json({ error: "El archivo del producto no es una imagen" }, { status: 415 });
  return new Response(imageResponse.body, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300", "Content-Disposition": "inline; filename=producto-electro-roun" } });
}
