import { readToken } from "../../auth";

const SUPABASE_URL = "https://bbacudythwqsnxhjfvpy.supabase.co";
const BUCKET = "electro-roun-fotos";

function serviceHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY || "";
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function POST(request: Request) {
  const session = await readToken(request.headers.get("cookie"));
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Acceso exclusivo para administradores" }, { status: 403 });
  }

  const secret = process.env.SUPABASE_SECRET_KEY || "";
  if (!secret) return Response.json({ error: "Falta configurar Supabase" }, { status: 500 });

  try {
    const form = await request.formData();
    const id = String(form.get("id") || "");
    const price = Number(form.get("price"));
    const image = form.get("image");
    if (!id || !Number.isFinite(price) || price <= 0) {
      return Response.json({ error: "Precio o producto inválido" }, { status: 400 });
    }

    const catalogResponse = await fetch(`${SUPABASE_URL}/rest/v1/tienda_catalogo?id=eq.catalogo&select=datos`, {
      headers: serviceHeaders(),
    });
    if (!catalogResponse.ok) throw new Error("No se pudo leer el catálogo");
    const rows = await catalogResponse.json();
    const products = Array.isArray(rows?.[0]?.datos) ? rows[0].datos : [];
    const product = products.find((item: Record<string, unknown>) => String(item.id) === id);
    if (!product) return Response.json({ error: "Producto no encontrado" }, { status: 404 });

    product.ventaManualProveedor = Math.round(price / 500) * 500;
    product.venta = product.ventaManualProveedor;

    if (image instanceof File && image.size > 0) {
      if (!image.type.startsWith("image/") || image.size > 5 * 1024 * 1024) {
        return Response.json({ error: "La imagen debe pesar menos de 5 MB" }, { status: 400 });
      }
      const extension = image.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
      const objectName = `${id.replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}.${extension}`;
      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectName}`, {
        method: "POST",
        headers: { ...serviceHeaders(), "content-type": image.type, "x-upsert": "true" },
        body: image,
      });
      if (!upload.ok) throw new Error("No se pudo subir la fotografía");
      const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectName}`;
      product.fotoManualProveedor = photoUrl;
      product.foto = photoUrl;
    }

    const save = await fetch(`${SUPABASE_URL}/rest/v1/tienda_catalogo?id=eq.catalogo`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ datos: products, actualizado: new Date().toISOString() }),
    });
    if (!save.ok) throw new Error("No se pudieron guardar los cambios");

    return Response.json({ ok: true, product });
  } catch (error) {
    return Response.json({ error: String(error instanceof Error ? error.message : error) }, { status: 500 });
  }
}
