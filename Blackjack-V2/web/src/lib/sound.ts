// Tiny synthesized sound effects (no audio files) + haptics.
import { load, save } from './storage';

let ctx: AudioContext | null = null;
let muted = load<boolean>('muted', false);

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  save('muted', m);
}

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.12, freq = 2400) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  card: () => noise(0.06, 0.18, 3200),
  flip: () => noise(0.09, 0.14, 1800),
  chip: () => {
    tone(2200, 0, 0.05, 'triangle', 0.05);
    tone(2900, 0.03, 0.05, 'triangle', 0.04);
  },
  win: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.06)),
  blackjack: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle', 0.07)),
  lose: () => {
    tone(220, 0, 0.25, 'sine', 0.06);
    tone(185, 0.12, 0.3, 'sine', 0.05);
  },
  tap: () => tone(880, 0, 0.03, 'sine', 0.03),
};

export function buzz(pattern: number | number[] = 12) {
  if (muted) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
