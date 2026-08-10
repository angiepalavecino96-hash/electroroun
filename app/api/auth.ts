const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) { return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""); }

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(process.env.SESSION_SECRET || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function makeToken(role: string, name: string) {
  const payload = `${role}|${name}|${Date.now() + 8 * 60 * 60 * 1000}`;
  return `${payload}|${await sign(payload)}`;
}

export async function readToken(cookie: string | null) {
  const token = cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("er_session="))?.slice(11);
  if (!token) return null;
  const parts = decodeURIComponent(token).split("|");
  if (parts.length !== 4) return null;
  const [role, name, expires, signature] = parts;
  const payload = `${role}|${name}|${expires}`;
  if (Number(expires) < Date.now() || signature !== await sign(payload)) return null;
  return { authenticated: true, role, name };
}
