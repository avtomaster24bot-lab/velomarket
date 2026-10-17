// Edge Function: вход через Telegram Login Widget → сессия Supabase Auth.
//
// Схема:
//  1) сайт получает от виджета Telegram объект user {id, first_name, username, photo_url, auth_date, hash};
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
import { verifyTelegramAuth } from "./telegram.ts";

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

Deno.serve(async (req) => {
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
  const meta = { tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null, photo_url: tg.photo_url ?? null };

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
  await admin.auth.admin.updateUserById(userId, { user_metadata: meta });

  // 3. профиль (is_admin / phone не трогаем)
  const { error: profErr } = await admin.from("profiles").upsert({
    id: userId, tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null,
    last_name: tg.last_name ?? null, photo_url: tg.photo_url ?? null,
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
    user: { id: userId, tg_id: tg.id, username: tg.username ?? null, first_name: tg.first_name ?? null, photo_url: tg.photo_url ?? null },
  }, 200, h);
});
