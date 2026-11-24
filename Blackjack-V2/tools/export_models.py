"""
Export Bertan's original bot models to compact JSON the TypeScript bots can run.

READ-ONLY with respect to ../Backend: this script only reads the original model
files and datasets, and writes into Blackjack-V2/packages/bots/models/.

Usage (Python 3.9 + scikit-learn 1.2.2, the version the pickles were saved with):
    /usr/bin/python3 -m venv tools/.venv
    tools/.venv/bin/pip install -r tools/requirements.txt
    tools/.venv/bin/python tools/export_models.py

Outputs:
    decision_tree.json   Bot5  (original tree, exact)
    random_forest.json   Bot4  (retrained compact forest; original is 44 MB)
    nn_bot2.json         Bot2  (dense weights from blackjack_model_bot2.h5)
    nn_player.json       Bot3  (dense weights from blackjack_model_player.h5)
    q_table.json         Bot6  (q_table_blackjack.npy)
    fixtures.json        parity fixtures: random states + Python predictions
"""
import ast
import json
import os
import random
import warnings

import h5py
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

warnings.simplefilter("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "Backend", "Bots", "AI_Models"))
OUT = os.path.normpath(os.path.join(HERE, "..", "packages", "bots", "models"))

SUITS = ["Hearts", "Diamonds", "Clubs", "Spades"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "Ace"]
CLASSES = ["D", "H", "S", "SP", "SU"]  # pd.get_dummies / sklearn order (sorted)


# ── Same feature encoding as Random_Forest.py / NN.py / Decision_Tree.py ──────
def encode_card(card):
    rank, suit = card.split(" of ")
    return SUITS.index(suit) * 13 + RANKS.index(rank)


def features(player_hand, house_upcard, count, bet):
    x = np.zeros(106)
    for c in player_hand:
        x[encode_card(c)] = 1
    x[52 + encode_card(house_upcard)] = 1
    x[104] = count
    x[105] = bet
    return x


def load_dataset(name):
    df = pd.read_csv(os.path.join(SRC, name))
    hands = df["Player Hand"].apply(ast.literal_eval)
    X = np.stack([features(h, u, c, b) for h, u, c, b in zip(hands, df["House Upcard"], df["Count"], df["Bet"])])
    return X, df["Move"].values


# ── Exporters ─────────────────────────────────────────────────────────────────
def tree_to_json(tree, classes, probs):
    """
    Compact pre-order encoding. sklearn builds trees depth-first, so an
    internal node's left child is always the next node; we only store the
    right child. Leaves: f = -1 and p = class index (pure leaf) or a
    normalised class distribution (impure leaf, forests average these).
    """
    assert list(classes) == CLASSES, classes
    t = tree.tree_
    leaf = t.children_left == -1
    for n in range(t.node_count):
        assert leaf[n] or t.children_left[n] == n + 1
    values = t.value[:, 0, :]
    dist = values / values.sum(axis=1, keepdims=True)
    f, th, r, p = [], [], [], []
    for n in range(t.node_count):
        if leaf[n]:
            f.append(-1); th.append(0); r.append(0)
            row = dist[n]
            if not probs or row.max() == 1.0:
                p.append(int(np.argmax(row)))
            else:
                p.append([round(float(v), 4) for v in row])
        else:
            f.append(int(t.feature[n]))
            thr = float(t.threshold[n])
            th.append(0.5 if abs(thr - 0.5) < 1e-9 else round(thr, 4))
            r.append(int(t.children_right[n]))
            p.append(0)
    return {"f": f, "t": th, "r": r, "p": p}


def leaf_dist(p):
    if isinstance(p, list):
        return np.array(p)
    out = np.zeros(len(CLASSES)); out[p] = 1
    return out


def dense_layers(path):
    f = h5py.File(path, "r")["model_weights"]
    layers = []
    for name in ["dense", "dense_1", "dense_2", "move_output"]:
        g = f[name][name]
        layers.append({
            "w": np.round(g["kernel:0"][()], 7).tolist(),  # [in][out]
            "b": np.round(g["bias:0"][()], 7).tolist(),
            "act": "softmax" if name == "move_output" else "relu",
        })
    return layers


def nn_predict(layers, x):
    a = x
    for L in layers:
        z = a @ np.array(L["w"]) + np.array(L["b"])
        a = np.maximum(z, 0) if L["act"] == "relu" else np.exp(z - z.max()) / np.exp(z - z.max()).sum()
    return int(np.argmax(a))


def tree_predict(tr, x):
    n = 0
    while tr["f"][n] != -1:
        n = n + 1 if x[tr["f"][n]] <= tr["t"][n] else tr["r"][n]
    return int(np.argmax(leaf_dist(tr["p"][n])))


def forest_predict(forest_json, x):
    total = np.zeros(len(CLASSES))
    for tr in forest_json["trees"]:
        n = 0
        while tr["f"][n] != -1:
            n = n + 1 if x[tr["f"][n]] <= tr["t"][n] else tr["r"][n]
        total += leaf_dist(tr["p"][n])
    return int(np.argmax(total))


def write(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"))
    print(f"  wrote {name:20s} {os.path.getsize(path) / 1024:8.1f} KB")


def export_basic_strategy():
    """Run Bertan's Basic_Strategy.py over every 2-card hand x upcard → lookup table."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "Basic_Strategy", os.path.join(SRC, "..", "Bots", "Basic_Strategy.py"))
    bs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bs)

    class Hand:
        def __init__(self, cards):
            self.hand = cards
            self.hand2 = cards

        def _val(self):
            v, aces = 0, 0
            for c in self.hand:
                r = c.split(" of ")[0]
                if r in ["Jack", "Queen", "King"]:
                    v += 10
                elif r == "Ace":
                    aces += 1
                else:
                    v += int(r)
            for _ in range(aces):
                v += 1 if v + 11 > 21 else 11
            return v

        calculate_hand_val = _val
        calculate_hand_val_2 = _val

    short = {"10": "T", "Jack": "J", "Queen": "Q", "King": "K", "Ace": "A"}
    table = {}
    for i, r1 in enumerate(RANKS):
        for r2 in RANKS[i:]:
            for up in RANKS:
                player = Hand([f"{r1} of Spades", f"{r2} of Hearts"])
                house = Hand([f"{up} of Clubs"])
                move = bs.apply_basic_strategy(house, player)
                assert move == bs.apply_basic_strategy_2(house, player), (r1, r2, up)
                key = f"{short.get(r1, r1)}{short.get(r2, r2)}|{short.get(up, up)}"
                table[key] = move
    return table


def random_state(rng):
    deck = [f"{r} of {s}" for s in SUITS for r in RANKS]
    n = rng.choice([2, 2, 2, 3, 4])
    cards = rng.sample(deck, n + 1)
    return {
        "hand": cards[:n],
        "upcard": cards[n],
        "count": rng.randint(-12, 12),
        "bet": rng.choice([10, 20, 50, 100, 200, 500]),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f"Reading originals from {SRC}")

    # Bot5 — decision tree (exact copy of the original tree).
    dt = joblib.load(os.path.join(SRC, "decision_tree_model.joblib"))
    dt_json = {"classes": CLASSES, "tree": tree_to_json(dt, dt.classes_, probs=False)}
    write("decision_tree.json", dt_json)
    assert all(
        CLASSES[tree_predict(dt_json["tree"], x)] == dt.predict(x.reshape(1, -1))[0]
        for x in load_dataset("blackjack_dataset_player.csv")[0]
    )

    # Bot1 — basic strategy table generated from the original Python function.
    write("basic_strategy.json", export_basic_strategy())

    # Bot4 — random forest: retrain compact on the same data/features/labels.
    X, y = load_dataset("blackjack_dataset.csv")
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    rf_orig = joblib.load(os.path.join(SRC, "random_forest_model.pkl"))
    rf = RandomForestClassifier(n_estimators=40, random_state=42, n_jobs=-1)
    rf.fit(X_tr, y_tr)
    rf_json = {"classes": CLASSES, "trees": [tree_to_json(e, rf.classes_, probs=True) for e in rf.estimators_]}
    write("random_forest.json", rf_json)

    # Bot2 / Bot3 — neural networks.
    nn2 = dense_layers(os.path.join(SRC, "blackjack_model_bot2.h5"))
    nn3 = dense_layers(os.path.join(SRC, "blackjack_model_player.h5"))
    write("nn_bot2.json", {"classes": CLASSES, "layers": nn2})
    write("nn_player.json", {"classes": CLASSES, "layers": nn3})

    # Bot6 — Q-table [player_sum 0..31][dealer 0..10][usable_ace 0..1][stand, hit].
    q = np.load(os.path.join(SRC, "q_table_blackjack.npy"))
    write("q_table.json", {"actions": ["S", "H"], "q": np.round(q, 6).tolist()})

    # ── Agreement report + parity fixtures ───────────────────────────────────
    rng = random.Random(1337)
    states = [random_state(rng) for _ in range(2000)]
    Xs = np.stack([features(s["hand"], s["upcard"], s["count"], s["bet"]) for s in states])

    small_pred = rf.predict(Xs)
    orig_pred = rf_orig.predict(Xs)
    json_pred = [CLASSES[forest_predict(rf_json, x)] for x in Xs]
    print("\nRandom forest (compact vs original 44 MB)")
    print(f"  holdout accuracy  original {rf_orig.score(X_te, y_te):.3f}   compact {rf.score(X_te, y_te):.3f}")
    print(f"  agreement on dataset holdout   {np.mean(rf.predict(X_te) == rf_orig.predict(X_te)):.3f}")
    print(f"  agreement on random states     {np.mean(small_pred == orig_pred):.3f}")
    print(f"  JSON export == sklearn         {np.mean(np.array(json_pred) == small_pred):.4f}")

    fixtures = []
    for s, x, rfp in zip(states, Xs, json_pred):
        fixtures.append({
            **s,
            "dt": str(dt.predict(x.reshape(1, -1))[0]),
            "rf": rfp,
            "nn_bot2": CLASSES[nn_predict(nn2, x)],
            "nn_player": CLASSES[nn_predict(nn3, x)],
        })
    write("fixtures.json", fixtures)


if __name__ == "__main__":
    main()
