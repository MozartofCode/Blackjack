import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { load, save } from './storage';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('Supabase is not configured');
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * A random secret that identifies this browser as a player (no signup).
 * The server only stores sha256(key), which is also the public player id.
 */
export function playerKey(): string {
  let key = load<string | null>('playerKey', null);
  if (!key || !/^[0-9a-f]{64}$/.test(key)) {
    key = hex(crypto.getRandomValues(new Uint8Array(32)));
    save('playerKey', key);
  }
  return key;
}

let idPromise: Promise<string> | null = null;
/** Public player id (as stored in leaderboards). */
export function ensureUser(): Promise<string> {
  idPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerKey())).then(hex);
  return idPromise;
}

/** Call the `daily` Edge Function, surfacing its own error message. */
export async function callDaily<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke<T>('daily', { body: { ...body, playerKey: playerKey() } });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = (await ctx.json()).error ?? message;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  if (!data) throw new Error('Empty response from the table');
  return data;
}

export async function getNickname(): Promise<string | null> {
  const id = await ensureUser();
  const { data } = await supabase().from('profiles').select('nickname').eq('id', id).maybeSingle();
  return (data?.nickname as string | undefined) ?? null;
}

export async function setNickname(nickname: string): Promise<void> {
  const clean = nickname.trim();
  if (!/^[A-Za-z0-9_\- ]{2,16}$/.test(clean)) throw new Error('2–16 letters, numbers, spaces, - or _');
  await callDaily({ op: 'nickname', nickname: clean });
}
