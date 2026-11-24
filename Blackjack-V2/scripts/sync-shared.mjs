// Copy the engine + bots packages into supabase/functions/_shared so the
// Edge Function bundles exactly the same game code as the web app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase/functions/_shared');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'packages/engine/src'), join(out, 'engine/src'), { recursive: true });
cpSync(join(root, 'packages/bots/src'), join(out, 'bots/src'), { recursive: true });
cpSync(join(root, 'packages/bots/models'), join(out, 'bots/models'), {
  recursive: true,
  filter: (src) => !src.endsWith('fixtures.json'),
});
console.log('synced engine + bots → supabase/functions/_shared');
