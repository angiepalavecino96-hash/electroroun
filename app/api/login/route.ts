import { makeToken } from "../auth";

export async function POST(request: Request) {
  const { role, name, password } = await request.json();
  const expected = role === "vendedor" ? process.env.VENDEDOR_PASSWORD : name === "Marce" ? process.env.MARCE_PASSWORD : name === "Cori" ? process.env.CORI_PASSWORD : "";
  if (!expected || password !== expected) return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
  const safeName = role === "vendedor" ? "Vendedores" : name;
  const token = await makeToken(role, safeName);
  return Response.json({ authenticated: true, role, name: safeName }, { headers: { "Set-Cookie": `er_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
}
