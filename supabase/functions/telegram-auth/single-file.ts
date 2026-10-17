// ============================================================
// VeloMarket — Edge Function «telegram-auth» ОДНИМ ФАЙЛОМ.
// Supabase → Edge Functions → Deploy a new function → Via Editor:
//   имя функции: telegram-auth, вставьте весь этот файл в index.ts, Deploy,
//   затем выключите «Verify JWT» и добавьте секрет TELEGRAM_BOT_TOKEN.
// Сгенерировано из index.ts + telegram.ts (tests/build_single_file.py).
// ============================================================
// Edge Function: вход через Telegram Login Widget → сессия Supabase Auth.
//
// Схема:
//  1) сайт получает от виджета Telegram объект user {id, first_name, username, auth_date, hash, …};
//     сохраняем ТОЛЬКО tg_id, first_name, username (телефон Telegram сайту не передаёт вообще;
//     фото и фамилию не храним);
//  2) POST сюда; проверяем HMAC-SHA256 подпись токеном бота и свежесть auth_date;
//  3) находим/создаём пользователя Supabase Auth (email tg<id>@<AUTH_EMAIL_DOMAIN>, письма не отправляются);
//  4) admin.generateLink(magiclink) → hashed_token → verifyOtp → настоящая сессия Supabase
//     (access_token + refresh_token, подписаны самим Supabase — работает и со старым JWT secret,
//      и с новыми ключами подписи);
//  5) обновляем profiles и отдаём сессию; сайт делает supabase.auth.setSession().
//
// Секреты (supabase secrets set): TELEGRAM_BOT_TOKEN — обязательно.
// Необязательно: ALLOWED_ORIGINS (через запятую), AUTH_MAX_AGE_SECONDS (по умолчанию 86400),
//                AUTH_EMAIL_DOMAIN (по умолчанию telegram.velomarket.app).
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.

import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------- проверка подписи Telegram ----------------
// Проверка данных Telegram Login Widget.
// Документация: https://core.telegram.org/widgets/login#checking-authorization
//   secret_key = SHA256(bot_token)
//   hash       = hex(HMAC_SHA256(data_check_string, secret_key))
//   data_check_string = все поля кроме hash, отсортированы по ключу, "key=value", через "\n"

// Наружу отдаём только то, что храним: id, имя, username.
// last_name и photo_url Telegram тоже присылает — они нужны ТОЛЬКО для проверки подписи и сразу отбрасываются.
export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
  auth_date: number;
}

export type VerifyResult =
  | { ok: true; user: TelegramUser }
  | { ok: false; error: string };

const enc = new TextEncoder();
const ALLOWED_KEYS = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function buildDataCheckString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .filter((k) => k !== "hash" && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
}

export async function computeTelegramHash(data: Record<string, unknown>, botToken: string): Promise<string> {
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(buildDataCheckString(data)));
  return toHex(sig);
}

export async function verifyTelegramAuth(
  input: unknown,
  botToken: string,
  opts: { maxAgeSeconds?: number; nowSeconds?: number } = {},
): Promise<VerifyResult> {
  const maxAge = opts.maxAgeSeconds ?? 86400;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!botToken) return { ok: false, error: "server_misconfigured" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "bad_payload" };
  const data = input as Record<string, unknown>;

  // Принимаем только поля виджета, значения — строки/числа ограниченной длины
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!ALLOWED_KEYS.has(k)) return { ok: false, error: "unexpected_field" };
    if (typeof v !== "string" && typeof v !== "number") return { ok: false, error: "bad_field_type" };
    if (String(v).length > 512) return { ok: false, error: "field_too_long" };
    clean[k] = v;
  }
  const hash = typeof clean.hash === "string" ? clean.hash.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: "bad_hash" };
  const id = Number(clean.id);
  const authDate = Number(clean.auth_date);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "bad_id" };
  if (!Number.isFinite(authDate)) return { ok: false, error: "bad_auth_date" };
  if (authDate > now + 300) return { ok: false, error: "auth_date_in_future" };
  if (now - authDate > maxAge) return { ok: false, error: "auth_expired" };

  const expected = await computeTelegramHash(clean, botToken);
  if (!timingSafeEqual(expected, hash)) return { ok: false, error: "invalid_hash" };

  return {
    ok: true,
    user: {
      id,
      auth_date: authDate,
      first_name: clean.first_name !== undefined ? String(clean.first_name).slice(0, 64) : undefined,
      username: clean.username !== undefined ? String(clean.username).slice(0, 64) : undefined,
    },
  };
}

// ---------------- обработчик запроса ----------------

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAX_AGE = Number(Deno.env.get("AUTH_MAX_AGE_SECONDS") ?? "86400");
const EMAIL_DOMAIN = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "telegram.velomarket.app";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://avtomaster24bot-lab.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Ограничение частоты: в памяти инстанса + в базе (rate_limit_hit)
const LIMIT_PER_MIN = 10;
const memHits = new Map<string, { t: number; n: number }>();
function memLimited(key: string): boolean {
  const now = Date.now();
  const e = memHits.get(key);
  if (!e || now - e.t > 60_000) { memHits.set(key, { t: now, n: 1 }); return false; }
  e.n++;
  if (memHits.size > 5000) memHits.clear();
  return e.n > LIMIT_PER_MIN;
}

function cors(origin: string | null): Record<string, string> {
  const allow = origin && (ALLOWED.includes("*") || ALLOWED.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function handler(req: Request): Promise<Response> {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (memLimited(ip)) return json({ error: "too_many_requests" }, 429, h);
  const { data: allowed, error: rlErr } = await admin.rpc("rate_limit_hit", {
    p_key: `tg-auth:${ip}`, p_limit: LIMIT_PER_MIN, p_window_seconds: 60,
  });
  if (!rlErr && allowed === false) return json({ error: "too_many_requests" }, 429, h);

  let payload: unknown;
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ error: "payload_too_large" }, 413, h);
    payload = JSON.parse(text);
  } catch {
    return json({ error: "bad_json" }, 400, h);
  }

  const v = await verifyTelegramAuth(payload, BOT_TOKEN, { maxAgeSeconds: MAX_AGE });
  if (!v.ok) return json({ error: v.error }, v.error === "server_misconfigured" ? 500 : 401, h);
  const tg = v.user;
  const email = `tg${tg.id}@${EMAIL_DOMAIN}`;
  const meta = { tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null };

  // 1. пользователь Supabase Auth: создаём, если ещё нет
  const { data: existing } = await admin.from("profiles").select("id, is_banned").eq("tg_id", tg.id).maybeSingle();
  if (existing?.is_banned) return json({ error: "banned" }, 403, h);
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
    if (error && !/already|exists|registered/i.test(error.message)) {
      console.error("createUser", error);
      return json({ error: "create_user_failed" }, 500, h);
    }
  }

  // 2. одноразовый токен входа (письмо НЕ отправляется)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token || !link.user) {
    console.error("generateLink", linkErr);
    return json({ error: "link_failed" }, 500, h);
  }
  const userId = link.user.id;
  // user_metadata сливается со старым — явно затираем поля, которые раньше могли сохраниться
  await admin.auth.admin.updateUserById(userId, { user_metadata: { ...meta, photo_url: null, last_name: null } });

  // 3. профиль: только tg_id, username, first_name (is_admin / is_banned не трогаем)
  const { error: profErr } = await admin.from("profiles").upsert({
    id: userId, tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null,
  }, { onConflict: "id" });
  if (profErr) {
    console.error("profile", profErr);
    return json({ error: "profile_failed" }, 500, h);
  }

  // 4. обмениваем токен на сессию
  const pub = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: otp, error: otpErr } = await pub.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (otpErr || !otp.session) {
    console.error("verifyOtp", otpErr);
    return json({ error: "session_failed" }, 500, h);
  }

  return json({
    access_token: otp.session.access_token,
    refresh_token: otp.session.refresh_token,
    expires_at: otp.session.expires_at,
    user: { id: userId, tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null },
  }, 200, h);
}

// Для локальных тестов можно отключить запуск сервера: TELEGRAM_AUTH_NO_SERVE=1
if (!Deno.env.get("TELEGRAM_AUTH_NO_SERVE")) Deno.serve(handler);
export { handler };
