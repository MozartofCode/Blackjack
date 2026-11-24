// Supabase Edge Function: POST /functions/v1/daily
//   { op: 'start', playerKey }                  → start or resume today's run
//   { op: 'act', playerKey, day, action }       → apply a player action
//   { op: 'nickname', playerKey, nickname }     → set the leaderboard name
//
// Players are identified by sha256(playerKey): a random secret each browser
// generates and keeps, so there is no signup. The shoe and hole card never
// leave this function (see publicView).
import { createClient } from '@supabase/supabase-js';
import type { ModelBundle } from '@bj/bots';
import { HttpError, type RunRow, type Store, type TableRow, actRun, startRun } from './logic.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());

// Exported models (tools/export_models.py), pinned to the commit they were
// published in. Override with MODELS_BASE_URL to host them elsewhere.
const MODELS_COMMIT = '55ec1d936253913635bbc02cbd0b5d3e452db62b';
const MODELS_BASE_URL =
  Deno.env.get('MODELS_BASE_URL') ??
  `https://raw.githubusercontent.com/MozartofCode/Blackjack/${MODELS_COMMIT}/Blackjack-V2/packages/bots/models`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let modelsPromise: Promise<ModelBundle> | null = null;
function loadModels(): Promise<ModelBundle> {
  modelsPromise ??= (async () => {
    const get = async (name: string) => {
      const res = await fetch(`${MODELS_BASE_URL}/${name}.json`);
      if (!res.ok) throw new Error(`model ${name}: HTTP ${res.status}`);
      return res.json();
    };
    const [forest, tree, nnBot2, nnPlayer, q] = await Promise.all(
      ['random_forest', 'decision_tree', 'nn_bot2', 'nn_player', 'q_table'].map(get),
    );
    return { forest, tree, nnBot2, nnPlayer, q } as ModelBundle;
  })().catch((err) => {
    modelsPromise = null; // retry on the next request
    throw err;
  });
  return modelsPromise;
}

function cors(origin: string | null) {
  const allow = ALLOWED.includes('*') ? '*' : origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

async function playerId(key: unknown): Promise<string> {
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) throw new HttpError(401, 'Missing player key. Reload the page.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const store: Store = {
  async getTable(day) {
    const { data, error } = await admin.from('daily_tables').select('day, seed_secret, lineup').eq('day', day).maybeSingle();
    if (error) throw error;
    return data as TableRow | null;
  },
  async createTable(row, botResults) {
    const { error } = await admin.from('daily_tables').upsert(row, { onConflict: 'day', ignoreDuplicates: true });
    if (error) throw error;
    const { error: e2 } = await admin
      .from('bot_daily_results')
      .upsert(botResults.map((b) => ({ ...b, day: row.day })), { onConflict: 'day,bot_id', ignoreDuplicates: true });
    if (e2) throw e2;
  },
  async getRun(userId, day) {
    const { data, error } = await admin.from('daily_runs').select('*').eq('user_id', userId).eq('day', day).maybeSingle();
    if (error) throw error;
    return data as RunRow | null;
  },
  async insertRun(row) {
    const { error } = await admin.from('daily_runs').upsert(row, { onConflict: 'user_id,day', ignoreDuplicates: true });
    if (error) throw error;
  },
  async updateRun(id, version, patch) {
    const { data, error } = await admin.from('daily_runs').update(patch).eq('id', id).eq('version', version).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },
  async rank(day, bankroll, finishedAt) {
    const better = await admin
      .from('daily_runs')
      .select('id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('status', 'finished')
      .or(`final_bankroll.gt.${bankroll},and(final_bankroll.eq.${bankroll},finished_at.lt."${finishedAt}")`);
    const total = await admin
      .from('daily_runs')
      .select('id', { count: 'exact', head: true })
      .eq('day', day)
      .eq('status', 'finished');
    if (better.error) throw better.error;
    if (total.error) throw total.error;
    return { rank: (better.count ?? 0) + 1, players: total.count ?? 0 };
  },
};

async function setNickname(userId: string, raw: unknown) {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  if (!/^[A-Za-z0-9_\- ]{2,16}$/.test(nickname)) throw new HttpError(400, '2–16 letters, numbers, spaces, - or _');
  const { error } = await admin.from('profiles').upsert({ id: userId, nickname });
  if (error) throw error.code === '23505' ? new HttpError(409, 'That nickname is taken') : error;
  return { nickname };
}

const secret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

  try {
    const body = await req.json().catch(() => ({}));
    const userId = await playerId(body.playerKey);
    const now = new Date();
    let result;
    if (body.op === 'start') result = await startRun(store, userId, now, await loadModels(), secret);
    else if (body.op === 'act') result = await actRun(store, userId, String(body.day), body.action, now, await loadModels());
    else if (body.op === 'nickname') result = await setNickname(userId, body.nickname);
    else throw new HttpError(400, 'Unknown op');
    return new Response(JSON.stringify(result), { headers });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : 'Something went wrong at the table';
    if (status === 500) console.error(err);
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});
