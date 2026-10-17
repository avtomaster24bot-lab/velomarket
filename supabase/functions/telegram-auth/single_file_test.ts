// Проверяем, что однофайловая версия даёт те же результаты и правильно отвечает по HTTP
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createHash, createHmac } from "node:crypto";

Deno.env.set("TELEGRAM_AUTH_NO_SERVE", "1");
Deno.env.set("TELEGRAM_BOT_TOKEN", "123:TEST");
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "x");
const mod = await import("./single-file.ts");

const sign = (d: Record<string, string | number>, t = "123:TEST") =>
  createHmac("sha256", createHash("sha256").update(t).digest())
    .update(Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join("\n")).digest("hex");
const now = Math.floor(Date.now() / 1000);

Deno.test("single-file: подпись валидна", async () => {
  const d = { id: 42, first_name: "Test", username: "t", auth_date: now };
  assert((await mod.verifyTelegramAuth({ ...d, hash: sign(d) }, "123:TEST")).ok);
});
Deno.test("single-file: подмена → invalid_hash", async () => {
  const d = { id: 42, first_name: "Test", auth_date: now };
  assertEquals(await mod.verifyTelegramAuth({ ...d, hash: sign(d), first_name: "X" }, "123:TEST"), { ok: false, error: "invalid_hash" });
});
Deno.test({ name: "single-file: HTTP — CORS, 405, 400, 401", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const opt = await mod.handler(new Request("http://x/", { method: "OPTIONS", headers: { origin: "https://avtomaster24bot-lab.github.io" } }));
  assertEquals(opt.headers.get("access-control-allow-origin"), "https://avtomaster24bot-lab.github.io");
  await opt.text();
  const g = await mod.handler(new Request("http://x/", { method: "GET" })); assertEquals(g.status, 405); await g.text();
  const bj = await mod.handler(new Request("http://x/", { method: "POST", body: "xx", headers: { "x-forwarded-for": "1.1.1.1" } })); assertEquals(bj.status, 400); await bj.text();
  const d = { id: 1, auth_date: now };
  const bad = await mod.handler(new Request("http://x/", { method: "POST", body: JSON.stringify({ ...d, hash: "a".repeat(64) }), headers: { "x-forwarded-for": "1.1.1.2" } }));
  assertEquals(bad.status, 401); assertEquals((await bad.json()).error, "invalid_hash");
} });
