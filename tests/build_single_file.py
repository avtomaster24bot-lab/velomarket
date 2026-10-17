# Пересборка supabase/functions/telegram-auth/single-file.ts из index.ts + telegram.ts
# Запуск: python3 tests/build_single_file.py
import os
d = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'functions', 'telegram-auth')
tg = open(os.path.join(d, 'telegram.ts')).read()
idx = open(os.path.join(d, 'index.ts')).read().replace('import { verifyTelegramAuth } from "./telegram.ts";\n', '')
head, body = idx.split('import { createClient } from "npm:@supabase/supabase-js@2";\n', 1)
body = body.replace('Deno.serve(async (req) => {', 'async function handler(req: Request): Promise<Response> {', 1).rstrip()
assert body.endswith('});')
body = body[:-3] + '}\n\n// Для локальных тестов можно отключить запуск сервера: TELEGRAM_AUTH_NO_SERVE=1\nif (!Deno.env.get("TELEGRAM_AUTH_NO_SERVE")) Deno.serve(handler);\nexport { handler };\n'
hdr = ('// ============================================================\n'
       '// VeloMarket — Edge Function «telegram-auth» ОДНИМ ФАЙЛОМ.\n'
       '// Supabase → Edge Functions → Deploy a new function → Via Editor:\n'
       '//   имя функции: telegram-auth, вставьте весь этот файл в index.ts, Deploy,\n'
       '//   затем выключите «Verify JWT» и добавьте секрет TELEGRAM_BOT_TOKEN.\n'
       '// Сгенерировано из index.ts + telegram.ts (tests/build_single_file.py).\n'
       '// ============================================================\n')
open(os.path.join(d, 'single-file.ts'), 'w').write(hdr + head + 'import { createClient } from "npm:@supabase/supabase-js@2";\n\n'
    + '// ---------------- проверка подписи Telegram ----------------\n' + tg
    + '\n// ---------------- обработчик запроса ----------------\n' + body)
print('ok')
