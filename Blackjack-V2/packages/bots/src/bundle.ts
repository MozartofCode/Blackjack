// Static import of every exported model (~1 MB gzipped in total).
// Web: load lazily with `await import('@bj/bots/bundle')`.
import forest from '../models/random_forest.json' with { type: 'json' };
import tree from '../models/decision_tree.json' with { type: 'json' };
import nnBot2 from '../models/nn_bot2.json' with { type: 'json' };
import nnPlayer from '../models/nn_player.json' with { type: 'json' };
import q from '../models/q_table.json' with { type: 'json' };
import type { ModelBundle } from './brain.ts';

export const models = { forest, tree, nnBot2, nnPlayer, q } as unknown as ModelBundle;
export default models;
