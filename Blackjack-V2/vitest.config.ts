import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/*/test/**/*.test.ts', 'supabase/functions/**/*.test.ts'], exclude: ['**/_shared/**', '**/node_modules/**'] } });
