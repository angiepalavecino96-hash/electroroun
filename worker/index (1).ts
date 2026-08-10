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
