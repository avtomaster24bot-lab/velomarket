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
