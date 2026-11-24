// Runtimes for the exported models (see tools/export_models.py).

export type Move = 'D' | 'H' | 'S' | 'SP' | 'SU';

export interface Prediction {
  move: Move;
  /** Probability / vote share of the chosen move, 0..1. */
  confidence: number;
}

/** Pre-order tree: left child = n + 1, `r` = right child, f = -1 marks a leaf. */
export interface TreeJson {
  f: number[];
  t: number[];
  r: number[];
  /** Leaf payload: class index (pure leaf) or class distribution. */
  p: (number | number[])[];
}

export interface DecisionTreeJson { classes: Move[]; tree: TreeJson }
export interface ForestJson { classes: Move[]; trees: TreeJson[] }
export interface DenseLayer { w: number[][]; b: number[]; act: 'relu' | 'softmax' }
export interface DenseNetJson { classes: Move[]; layers: DenseLayer[] }
export interface QTableJson { actions: ('S' | 'H')[]; q: number[][][][] }

function leaf(tree: TreeJson, x: ArrayLike<number>): number | number[] {
  let n = 0;
  while (tree.f[n] !== -1) n = x[tree.f[n]] <= tree.t[n] ? n + 1 : tree.r[n];
  return tree.p[n];
}

function argmax(v: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

export function predictTree(model: DecisionTreeJson, x: ArrayLike<number>): Prediction {
  const p = leaf(model.tree, x);
  const idx = typeof p === 'number' ? p : argmax(p);
  return { move: model.classes[idx], confidence: typeof p === 'number' ? 1 : p[idx] };
}

/** sklearn RandomForest: average of per-tree leaf class distributions. */
export function predictForest(model: ForestJson, x: ArrayLike<number>): Prediction {
  const total = new Float64Array(model.classes.length);
  for (const tree of model.trees) {
    const p = leaf(tree, x);
    if (typeof p === 'number') total[p] += 1;
    else for (let i = 0; i < p.length; i++) total[i] += p[i];
  }
  const idx = argmax(total);
  return { move: model.classes[idx], confidence: total[idx] / model.trees.length };
}

/** Keras Dense stack forward pass (kernel is [in][out]). */
export function predictDense(model: DenseNetJson, x: ArrayLike<number>): Prediction {
  let a: Float64Array = Float64Array.from(x as ArrayLike<number>);
  for (const layer of model.layers) {
    const out = new Float64Array(layer.b.length);
    for (let j = 0; j < out.length; j++) out[j] = layer.b[j];
    for (let i = 0; i < a.length; i++) {
      const ai = a[i];
      if (ai === 0) continue;
      const row = layer.w[i];
      for (let j = 0; j < out.length; j++) out[j] += ai * row[j];
    }
    if (layer.act === 'relu') {
      for (let j = 0; j < out.length; j++) if (out[j] < 0) out[j] = 0;
    } else {
      const max = Math.max(...out);
      let sum = 0;
      for (let j = 0; j < out.length; j++) sum += out[j] = Math.exp(out[j] - max);
      for (let j = 0; j < out.length; j++) out[j] /= sum;
    }
    a = out;
  }
  const idx = argmax(a);
  return { move: model.classes[idx], confidence: a[idx] };
}

/** Q-learning lookup on (player sum, dealer upcard 1-10, usable ace). */
export function predictQ(model: QTableJson, playerSum: number, dealer: number, usableAce: number): Prediction & { q: number[] } {
  const q = model.q[Math.min(playerSum, 31)][dealer][usableAce];
  const idx = argmax(q);
  return { move: model.actions[idx], confidence: 1, q };
}
