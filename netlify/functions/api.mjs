// Touch Notice Board API — one Netlify Function that serves every /api/* route.
//
//   GET  /api/content            published content (public, used by the kiosk)
//   GET  /api/content?draft=1    draft content (admin only)
//   POST /api/login              { password } -> { token }
//   PUT  /api/draft              save draft (admin)
//   POST /api/publish            draft -> published, keeps a history copy (admin)
//   GET  /api/history            list published versions (admin)
//   POST /api/restore            { key } -> copy a version back into the draft (admin)
//   POST /api/upload             image upload, raw body (admin) -> { url }
//   GET  /api/file/<key>         serve an uploaded file (public)
//   POST /api/feedback           { rating: 0-3 } (public)
//   GET  /api/feedback           totals by day (admin)
//
// Netlify environment variables:
//   ADMIN_PASSWORD   the password staff type on /admin   (required)
//   SESSION_SECRET   any long random text                (recommended)

import { getStore } from "@netlify/blobs";

const MAX_UPLOAD = 6 * 1024 * 1024; // 6 MB
const HISTORY_KEEP = 20;
const SESSION_HOURS = 12;

const store = (name) => (globalThis.__memStores ? globalThis.__memStores(name) : getStore({ name, consistency: "strong" }));

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
const fail = (status, message) => json({ error: message }, status);

const env = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];

// ---- sessions: signed, expiring tokens (no database needed) ----
const enc = new TextEncoder();
async function hmac(text) {
  const secret = env("SESSION_SECRET") || "tnb:" + (env("ADMIN_PASSWORD") || "");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Buffer.from(sig).toString("base64url");
}
async function makeToken() {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  return `${exp}.${await hmac(String(exp))}`;
}
async function isAdmin(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = await hmac(exp);
  return good.length === sig.length && timingSafe(good, sig);
}
function timingSafe(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// crude per-instance throttle for login attempts
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  list.push(now); attempts.set(ip, list);
  return list.length > 10;
}

function validContent(c) {
  return c && typeof c === "object" && c.settings && Array.isArray(c.categories) && Array.isArray(c.countries);
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method;
  const content = store("content");

  try {
    // ---------- public ----------
    if (path === "content" && method === "GET") {
      if (url.searchParams.get("draft")) {
        if (!(await isAdmin(req))) return fail(401, "Please log in again.");
        const draft = (await content.get("draft", { type: "json" })) || (await content.get("published", { type: "json" }));
        return draft ? json(draft) : fail(404, "No content yet");
      }
      const pub = await content.get("published", { type: "json" });
      return pub ? json(pub) : fail(404, "No content published yet");
    }

    if (path.startsWith("file/") && method === "GET") {
      const key = decodeURIComponent(path.slice(5));
      const r = await store("uploads").getWithMetadata(key, { type: "arrayBuffer" });
      if (!r) return new Response("Not found", { status: 404 });
      return new Response(r.data, { headers: { "content-type": r.metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" } });
    }

    if (path === "feedback" && method === "POST") {
      const { rating } = await req.json().catch(() => ({}));
      if (![0, 1, 2, 3].includes(rating)) return fail(400, "Bad rating");
      const fb = store("feedback");
      const day = new Date().toISOString().slice(0, 10);
      const all = (await fb.get("totals", { type: "json" })) || {};
      all[day] = all[day] || [0, 0, 0, 0];
      all[day][rating]++;
      await fb.setJSON("totals", all);
      return json({ ok: true });
    }

    if (path === "login" && method === "POST") {
      const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
      if (tooMany(ip)) return fail(429, "Too many attempts. Wait 10 minutes and try again.");
      const want = env("ADMIN_PASSWORD");
      if (!want) return fail(500, "The admin password hasn't been set up yet. Add ADMIN_PASSWORD in Netlify → Environment variables.");
      const { password } = await req.json().catch(() => ({}));
      if (typeof password !== "string" || password !== want) return fail(401, "That password isn't right.");
      return json({ token: await makeToken(), hours: SESSION_HOURS });
    }

    // ---------- admin only ----------
    if (!(await isAdmin(req))) return fail(401, "Please log in again.");

    if (path === "session" && method === "GET") return json({ ok: true });

    if (path === "draft" && method === "PUT") {
      const body = await req.json().catch(() => null);
      if (!validContent(body)) return fail(400, "That content couldn't be saved.");
      body.updatedAt = new Date().toISOString();
      await content.setJSON("draft", body);
      return json({ ok: true, updatedAt: body.updatedAt });
    }

    if (path === "publish" && method === "POST") {
      const draft = await content.get("draft", { type: "json" });
      if (!validContent(draft)) return fail(400, "There's nothing to publish yet.");
      draft.publishedAt = new Date().toISOString();
      await content.setJSON("published", draft);
      await content.setJSON("draft", draft);
      const key = "history/" + draft.publishedAt;
      await content.setJSON(key, draft);
      const { blobs } = await content.list({ prefix: "history/" });
      const old = blobs.map((b) => b.key).sort().slice(0, -HISTORY_KEEP);
      await Promise.all(old.map((k) => content.delete(k)));
      return json({ ok: true, publishedAt: draft.publishedAt });
    }

    if (path === "history" && method === "GET") {
      const { blobs } = await content.list({ prefix: "history/" });
      return json(blobs.map((b) => b.key).sort().reverse().map((key) => ({ key, at: key.slice(8) })));
    }

    if (path === "restore" && method === "POST") {
      const { key } = await req.json().catch(() => ({}));
      if (typeof key !== "string" || !key.startsWith("history/")) return fail(400, "Unknown version");
      const v = await content.get(key, { type: "json" });
      if (!v) return fail(404, "That version no longer exists.");
      await content.setJSON("draft", v);
      return json(v);
    }

    if (path === "upload" && method === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(type)) return fail(415, "Please upload a JPG, PNG, WebP, GIF or SVG image.");
      const buf = await req.arrayBuffer();
      if (buf.byteLength > MAX_UPLOAD) return fail(413, "That image is too big. Keep it under 6 MB.");
      const ext = type.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
      const key = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await store("uploads").set(key, buf, { metadata: { type } });
      return json({ url: "/api/file/" + key });
    }

    if (path === "feedback" && method === "GET") {
      return json((await store("feedback").get("totals", { type: "json" })) || {});
    }

    return fail(404, "Unknown request");
  } catch (e) {
    console.error(e);
    return fail(500, "Something went wrong on the server. Try again in a minute.");
  }
};

export const config = { path: "/api/*" };
