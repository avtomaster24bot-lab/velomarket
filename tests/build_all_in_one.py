# Собирает supabase/all_in_one.sql из всех миграций (по порядку имён)
import glob, os
root = os.path.join(os.path.dirname(__file__), '..')
out = ['-- VeloMarket: ВСЕ миграции одним файлом (для SQL Editor в Supabase). Сгенерировано из supabase/migrations/.\n']
for f in sorted(glob.glob(os.path.join(root, 'supabase/migrations/*.sql'))):
    out.append(f'\n-- ===================== {os.path.basename(f)} =====================\n')
    out.append(open(f, encoding='utf-8').read().rstrip() + '\n')
open(os.path.join(root, 'supabase/all_in_one.sql'), 'w', encoding='utf-8').write(''.join(out))
print('ok', sum(len(x) for x in out), 'chars')
