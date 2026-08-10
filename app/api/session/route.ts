import { readToken } from "../auth";
export async function GET(request: Request) { return Response.json((await readToken(request.headers.get("cookie"))) || { authenticated: false }); }
