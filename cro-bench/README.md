# CRO Bench (`beadz-cro-bench`)

Offline experiment rig for the **Chief Reserve Officer** — the small
vision-language model that will one day "audit" the reserve jar. Before any
CRO ships in the camera pipeline, this bench answers two questions:

1. **Voice:** can SmolVLM-500M hold the CRO's institutional deadpan in the one
   unconstrained flavor sentence, without drifting? (Judged by reading
   `out/<run>/transcript.md`.)
2. **Cost:** what does an hourly cold start cost on the Pi — model load from
   SD vs. inference time? (Read `model_load_s` and per-call `wall_ms` from
   `out/<run>/results.jsonl`; peak RSS is the RAM-fit number.)

The audit is ~90% template owned by code; the model fills three
grammar-constrained slots (jar present/absent, lid seated/ajar, bead level)
plus the flavor sentence. Grammars emit the exact words the template prints,
so a variant directory under `variants/` owns the entire audit shape —
prompts, allowed answers, sampling, skeleton.

## Setup

1. **llama.cpp** (not vendored — bring your own `llama-server`):
   - Linux / Raspberry Pi OS:
     ```bash
     sudo apt-get install -y git cmake build-essential
     git clone https://github.com/ggml-org/llama.cpp
     cd llama.cpp && cmake -B build && cmake --build build --target llama-server -j
     ```
     NEON is automatic on aarch64. Note the resulting
     `build/bin/llama-server` path for `--server-bin`.
   - Windows: download a prebuilt CPU release zip from the llama.cpp GitHub
     releases page and use its `llama-server.exe`.
2. **This package:** `pip install -e .[dev]` (then `pytest` — the suite runs
   anywhere, no llama.cpp or models needed).
3. **Models:** `beadz-cro-bench fetch-models` downloads the pinned
   SmolVLM-500M GGUF + mmproj into `models/` and verifies their SHA-256s.
4. **Images:** drop jar photos into `samples/`. They are gitignored and must
   never be committed — anywhere, ever.

## Run

```bash
beadz-cro-bench run --variant v1
```

Run from this directory (`cro-bench/`). Each run writes
`out/<run-name>/results.jsonl` (machine: `run_start`, per-call records,
`run_end` with peak RSS), `transcript.md` (human: rendered audits — the drift
judgment happens here), and `llama-server.log`. `llama-server.log` is written
only when the bench spawns the server itself — not in warm `--server-url`
mode, since no server process is spawned there.

Compare prompt experiments by copying `variants/v1` to `variants/v2`, editing,
and passing `--variant v1 --variant v2` in one run.

### Warm iteration (dev machines only)

Start the server yourself, then point runs at it — the model stays loaded
across a prompt-editing session:

```bash
llama-server -m models/SmolVLM-500M-Instruct-Q8_0.gguf \
    --mmproj models/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf --port 8091
beadz-cro-bench run --variant v1 --server-url http://127.0.0.1:8091
```

Warm-mode runs record `model_load_s: null` — they are prompt experiments,
not timing measurements. Production will **not** have a resident server: on a
1 GB Pi the hourly job spawns inference and tears it down.

## Honest Pi numbers

The page cache makes a second model load look fast, and over an hour on a
1 GB board the cache is likely evicted anyway. For the true hourly bring-up
cost, drop caches before a timing run:

```bash
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches
beadz-cro-bench run --variant v1
```

Then read `model_load_s` (bring-up) and the call `wall_ms` values
(inference) from `results.jsonl`, and `peak_rss_kb` from its `run_end`
line (RAM fit). These numbers decide whether spawn-per-hour is cheap enough
for the production CRO.

## Models

The bench pins the Q8_0 GGUF for SmolVLM-500M. There is no upstream Q4 quant
for this model — only Q8_0 and f16 are published — so if Q8_0 proves too
large for the Pi's RAM, the fallback lever is a smaller model or an
f16-to-lower-quant requantize, not a ready-made Q4 download.

---

*The Officer will see you now. One (1) sentence ≈ one (1) audit.*
