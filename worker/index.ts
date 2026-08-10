/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
// @ts-expect-error Runtime JavaScript module for provider synchronization.
import { ejecutarSincronizacionSegura } from "../src/proveedores-sync.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  DOLAR_PROVEEDORES?: string;
  SESSION_SECRET: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/carga-inicial-er-8f4c2a91") {
      if (request.method === "GET") {
        return new Response(
          `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Carga inicial Electro Roun</title><body style="font-family:Arial;max-width:520px;margin:60px auto;padding:24px;background:#07172b;color:white"><h1>Carga inicial Electro Roun</h1><p>Este botón ejecuta una única actualización inmediata desde los proveedores.</p><form method="post"><button style="padding:12px 18px;background:#e7ad2b;border:0;font-weight:bold">Cargar productos ahora</button></form></body></html>`,
          { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
        );
      }

      if (request.method !== "POST") {
        return new Response("Método no permitido", { status: 405 });
      }

      try {
        const resultado = await ejecutarSincronizacionSegura(env);
        return Response.json(resultado, {
          headers: { "cache-control": "no-store" },
        });
      } catch (error) {
        return Response.json(
          { ok: false, error: String(error instanceof Error ? error.message : error) },
          { status: 500, headers: { "cache-control": "no-store" } },
        );
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller: { cron?: string; scheduledTime?: number }, env: Env): Promise<void> {
    console.log(
      `ELECTRO_ROUN_CRON_INICIO ${JSON.stringify({
        cron: controller?.cron || "desconocido",
        scheduledTime: controller?.scheduledTime || Date.now(),
      })}`,
    );

    try {
      const resultado = await ejecutarSincronizacionSegura(env);
      console.log(`ELECTRO_ROUN_CRON_OK ${JSON.stringify(resultado)}`);
    } catch (error) {
      console.error(
        `ELECTRO_ROUN_CRON_ERROR ${String(
          error instanceof Error ? error.message : error,
        )}`,
      );
      throw error;
    }
  },
};

export default worker;
