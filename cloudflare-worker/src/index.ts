/**
 * ─────── Created: 2026-11-14 | Purpose: Cloudflare Worker for 1000x1500 Pinterest Image Gen, R2 Hosting, Free LLM Fallback & n8n Keep-Alive Cron | Last verified with: Cloudflare Workers 2026 ───────
 * Run with AI CLI: [npx wrangler deploy]
 */

export interface Env {
  AI: Ai;
  PINS_BUCKET: R2Bucket;
  CF_WORKER_SECRET: string;
  N8N_PUBLIC_URL?: string;
  R2_PUBLIC_BASE_URL?: string;
  STRICT_DIMENSIONS?: string;
}

export interface ImageDimensions {
  format: "png" | "jpeg";
  width: number;
  height: number;
}

const TARGET_WIDTH = 1000;
const TARGET_HEIGHT = 1500;

/**
 * Parses binary PNG (IHDR) or JPEG (SOF0/SOF1/SOF2) headers to extract exact pixel dimensions.
 */
export function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;

  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  if (isPng) {
    // IHDR chunk starts at byte 12 ("IHDR"), width at 16..19, height at 20..23 (big-endian)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { format: "png", width, height };
  }

  // Check JPEG SOI marker: FF D8
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // Skip padding FF bytes
      if (marker === 0xff) {
        offset++;
        continue;
      }
      // Standalone markers without length
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2, false);
      // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (offset + 9 <= bytes.length) {
          const height = view.getUint16(offset + 5, false);
          const width = view.getUint16(offset + 7, false);
          return { format: "jpeg", width, height };
        }
        return null;
      }
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.CF_WORKER_SECRET) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token.length > 0 && constantTimeEqual(token, env.CF_WORKER_SECRET);
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check endpoint
    if (request.method === "GET" && url.pathname === "/healthz") {
      return jsonResponse({ ok: true, service: "pinterest-media-worker", target_dimensions: `${TARGET_WIDTH}x${TARGET_HEIGHT}` });
    }

    // 2. Public R2 Image Delivery: GET /pins/<filename>
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/pins/")) {
      const key = url.pathname.slice(1); // "pins/<filename>"
      if (!/^pins\/[a-zA-Z0-9._-]+$/.test(key)) {
        return jsonResponse({ error: "Invalid pin key" }, 400);
      }

      const object = await env.PINS_BUCKET.get(key);
      if (!object) {
        return jsonResponse({ error: "Pin image not found" }, 404);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      if (!headers.has("content-type")) {
        headers.set("content-type", key.endsWith(".jpg") || key.endsWith(".jpeg") ? "image/jpeg" : "image/png");
      }

      return new Response(request.method === "HEAD" ? null : object.body, {
        status: 200,
        headers,
      });
    }

    // Protected POST routes
    if (!isAuthorized(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // 3. Generate 1000x1500 Vertical Pinterest Image & Upload to R2
    if (request.method === "POST" && url.pathname === "/generate-pin-image") {
      let payload: { prompt?: string; content_hash?: string };
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const prompt = String(payload.prompt || "").trim();
      const contentHash = String(payload.content_hash || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (prompt.length < 10) {
        return jsonResponse({ error: "prompt must be at least 10 characters" }, 400);
      }
      if (!contentHash) {
        return jsonResponse({ error: "content_hash is required for deterministic R2 storage" }, 400);
      }

      const rawKey = `pins/raw-${contentHash}.png`;
      const finalKey = `pins/${contentHash}.png`;

      // Idempotency: return existing hosted image if already generated
      const existing = await env.PINS_BUCKET.head(finalKey);
      if (existing) {
        const base = (env.R2_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
        return jsonResponse({
          image_url: `${base}/${finalKey}`,
          width: TARGET_WIDTH,
          height: TARGET_HEIGHT,
          r2_key: finalKey,
          content_type: existing.httpMetadata?.contentType || "image/png",
          size_bytes: existing.size,
          cached: true,
        });
      }

      // Call Cloudflare Workers AI Flux-1-Schnell (free tier)
      const aiResult = (await env.AI.run("@cf/black-forest-labs/flux-1-schnell" as keyof AiModels, {
        prompt: `${prompt}, vertical Pinterest pin composition 2:3 aspect ratio, editorial photography, crisp lighting, clean negative space`,
        num_steps: 4,
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
      } as Record<string, unknown>)) as { image?: string };

      if (!aiResult?.image) {
        return jsonResponse({ error: "Workers AI did not return an image payload" }, 502);
      }

      let imageBytes = decodeBase64(aiResult.image);
      let dims = parseImageDimensions(imageBytes);

      // If model snapped to non-1000x1500 dimensions, normalize via Cloudflare Image Resizing (requires zone)
      if (!dims || dims.width !== TARGET_WIDTH || dims.height !== TARGET_HEIGHT) {
        await env.PINS_BUCKET.put(rawKey, imageBytes, {
          httpMetadata: { contentType: dims?.format === "jpeg" ? "image/jpeg" : "image/png" },
        });

        const base = (env.R2_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
        const resizeResp = await fetch(`${base}/${rawKey}`, {
          cf: {
            image: {
              width: TARGET_WIDTH,
              height: TARGET_HEIGHT,
              fit: "cover",
              format: "png",
            },
          },
        } as RequestInit);

        if (resizeResp.ok) {
          const resized = new Uint8Array(await resizeResp.arrayBuffer());
          const resizedDims = parseImageDimensions(resized);
          if (resizedDims) {
            imageBytes = resized;
            dims = resizedDims;
          }
        }
        await env.PINS_BUCKET.delete(rawKey);
      }

      const strict = (env.STRICT_DIMENSIONS || "true").toLowerCase() === "true";
      if (!dims || (strict && (dims.width !== TARGET_WIDTH || dims.height !== TARGET_HEIGHT))) {
        return jsonResponse(
          {
            error: "Image dimensions did not match required 1000x1500 pixels",
            observed: dims,
            hint: "Attach a custom domain with Cloudflare Image Transformations enabled or set STRICT_DIMENSIONS=false only for non-strict sandbox testing.",
          },
          422
        );
      }

      const contentType = dims.format === "jpeg" ? "image/jpeg" : "image/png";
      await env.PINS_BUCKET.put(finalKey, imageBytes, {
        httpMetadata: { contentType },
        customMetadata: {
          width: String(dims.width),
          height: String(dims.height),
          content_hash: contentHash,
        },
      });

      const base = (env.R2_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
      return jsonResponse({
        image_url: `${base}/${finalKey}`,
        width: dims.width,
        height: dims.height,
        r2_key: finalKey,
        content_type: contentType,
        size_bytes: imageBytes.byteLength,
        cached: false,
      });
    }

    // 4. Optional $0 Anthropic-Compatible Fallback via Workers AI (for testing without Claude credits)
    if (request.method === "POST" && url.pathname === "/generate-seo-copy") {
      const body = (await request.json()) as {
        system?: string;
        messages?: Array<{ role: string; content: string }>;
      };

      const aiResp = (await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as keyof AiModels, {
        messages: [
          ...(body.system ? [{ role: "system", content: body.system }] : []),
          ...(body.messages || []),
        ],
        max_tokens: 800,
        temperature: 0.4,
      } as Record<string, unknown>)) as { response?: string };

      return jsonResponse({
        id: `cf-msg-${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        content: [{ type: "text", text: aiResp.response || "" }],
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },

  /**
   * 10-minute Cloudflare Cron Trigger to keep Hugging Face Spaces n8n instance awake 24/7.
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.N8N_PUBLIC_URL) {
      console.log("N8N_PUBLIC_URL not configured; skipping keep-alive ping.");
      return;
    }

    const healthUrl = `${env.N8N_PUBLIC_URL.replace(/\/$/, "")}/healthz`;
    ctx.waitUntil(
      fetch(healthUrl, { method: "GET" })
        .then((res) => console.log(`Keep-alive ping ${healthUrl} -> HTTP ${res.status}`))
        .catch((err) => console.error(`Keep-alive ping failed: ${String(err)}`))
    );
  },
};
