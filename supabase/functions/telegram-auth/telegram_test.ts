// Юнит-тесты проверки подписи Telegram. Запуск: deno test supabase/functions/telegram-auth/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createHash, createHmac } from "node:crypto";
import { buildDataCheckString, verifyTelegramAuth } from "./telegram.ts";

const TOKEN = "123456789:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz"; // тестовый, не настоящий
const NOW = 1_790_000_000;

// Независимая реализация (node:crypto), чтобы не проверять код сам собой
function sign(data: Record<string, string | number>, token = TOKEN): string {
  const secret = createHash("sha256").update(token).digest();
  const dcs = Object.keys(data).filter((k) => k !== "hash").sort().map((k) => `${k}=${data[k]}`).join("\n");
  return createHmac("sha256", secret).update(dcs).digest("hex");
}
function sample(extra: Record<string, string | number> = {}): Record<string, string | number> {
  const d: Record<string, string | number> = {
    id: 777000111, first_name: "Алмас", username: "almas_kz",
    photo_url: "https://t.me/i/userpic/320/x.jpg", auth_date: NOW - 60, ...extra,
  };
  return { ...d, hash: sign(d) };
}

Deno.test("data_check_string: сортировка и формат", () => {
  assertEquals(buildDataCheckString({ id: 1, auth_date: 2, hash: "x", first_name: "A" }), "auth_date=2\nfirst_name=A\nid=1");
});
Deno.test("валидная подпись принимается", async () => {
  const r = await verifyTelegramAuth(sample(), TOKEN, { nowSeconds: NOW });
  assert(r.ok, JSON.stringify(r));
  if (r.ok) { assertEquals(r.user.id, 777000111); assertEquals(r.user.username, "almas_kz"); }
});
Deno.test("валидная подпись без username/photo", async () => {
  const d: Record<string, string | number> = { id: 5, first_name: "Bek", auth_date: NOW };
  assert((await verifyTelegramAuth({ ...d, hash: sign(d) }, TOKEN, { nowSeconds: NOW })).ok);
});
Deno.test("hash в верхнем регистре тоже принимается", async () => {
  const s = sample(); s.hash = String(s.hash).toUpperCase();
  assert((await verifyTelegramAuth(s, TOKEN, { nowSeconds: NOW })).ok);
});
Deno.test("подмена поля → invalid_hash", async () => {
  const s = sample(); s.username = "hacker";
  assertEquals(await verifyTelegramAuth(s, TOKEN, { nowSeconds: NOW }), { ok: false, error: "invalid_hash" });
});
Deno.test("подмена id → invalid_hash", async () => {
  const s = sample(); s.id = 1;
  assertEquals((await verifyTelegramAuth(s, TOKEN, { nowSeconds: NOW })) as unknown, { ok: false, error: "invalid_hash" });
});
Deno.test("чужой токен бота → invalid_hash", async () => {
  assertEquals(await verifyTelegramAuth(sample(), "999:OTHER", { nowSeconds: NOW }), { ok: false, error: "invalid_hash" });
});
Deno.test("просроченный auth_date → auth_expired", async () => {
  const r = await verifyTelegramAuth(sample({ auth_date: NOW - 90_000 }), TOKEN, { nowSeconds: NOW });
  assertEquals(r, { ok: false, error: "auth_expired" });
});
Deno.test("auth_date из будущего → отказ", async () => {
  const r = await verifyTelegramAuth(sample({ auth_date: NOW + 3600 }), TOKEN, { nowSeconds: NOW });
  assertEquals(r, { ok: false, error: "auth_date_in_future" });
});
Deno.test("нет hash / мусор / лишние поля", async () => {
  const { hash: _h, ...noHash } = sample();
  assertEquals(await verifyTelegramAuth(noHash, TOKEN, { nowSeconds: NOW }), { ok: false, error: "bad_hash" });
  assertEquals(await verifyTelegramAuth(null, TOKEN, { nowSeconds: NOW }), { ok: false, error: "bad_payload" });
  assertEquals(await verifyTelegramAuth([1], TOKEN, { nowSeconds: NOW }), { ok: false, error: "bad_payload" });
  assertEquals(await verifyTelegramAuth({ ...sample(), is_admin: true }, TOKEN, { nowSeconds: NOW }), { ok: false, error: "unexpected_field" });
  assertEquals(await verifyTelegramAuth({ ...sample(), first_name: { a: 1 } }, TOKEN, { nowSeconds: NOW }), { ok: false, error: "bad_field_type" });
});
Deno.test("пустой токен на сервере → server_misconfigured", async () => {
  assertEquals(await verifyTelegramAuth(sample(), "", { nowSeconds: NOW }), { ok: false, error: "server_misconfigured" });
});
