export async function POST() { return Response.json({ ok: true }, { headers: { "Set-Cookie": "er_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" } }); }
