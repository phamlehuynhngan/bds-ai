/**
 * Máy chủ trung gian (Cloudflare Worker) cho trợ lý BĐS AI.
 * Giữ khoá API ở phía máy chủ để người xem web công khai không cần khoá riêng.
 *
 * Triển khai:
 *   npm i -g wrangler && wrangler login
 *   wrangler deploy worker/claude-proxy.js --name bds-ai-proxy --compatibility-date 2026-10-01
 *   wrangler secret put ANTHROPIC_API_KEY --name bds-ai-proxy
 * Sau đó trên web: Hỏi đáp → Cài đặt → Máy chủ trung gian → https://bds-ai-proxy.<tài-khoản>.workers.dev
 */
const ALLOWED_ORIGINS = ["https://phamlehuynhngan.github.io", "http://localhost:8000", "http://127.0.0.1:8000"];
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
const MAX_BODY = 400_000; // byte

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, anthropic-version, anthropic-beta, x-api-key, anthropic-dangerous-direct-browser-access, x-stainless-arch, x-stainless-lang, x-stainless-os, x-stainless-package-version, x-stainless-retry-count, x-stainless-runtime, x-stainless-runtime-version, x-stainless-timeout",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", {status: 403});
    if (req.method === "OPTIONS") return new Response(null, {headers: cors(origin)});
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/v1/messages") return new Response("Not found", {status: 404, headers: cors(origin)});
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response("Payload too large", {status: 413, headers: cors(origin)});
    let body;
    try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", {status: 400, headers: cors(origin)}); }
    body.model = MODEL;                                   // chỉ cho phép một mô hình
    body.max_tokens = Math.min(body.max_tokens || MAX_TOKENS, MAX_TOKENS);
    delete body.stream;
    const headers = {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": req.headers.get("anthropic-version") || "2026-10-21",
    };
    const beta = req.headers.get("anthropic-beta");
    if (beta) headers["anthropic-beta"] = beta;
    const r = await fetch("https://api.anthropic.com/v1/messages", {method: "POST", headers, body: JSON.stringify(body)});
    return new Response(r.body, {status: r.status, headers: {...cors(origin), "content-type": r.headers.get("content-type") || "application/json"}});
  },
};
