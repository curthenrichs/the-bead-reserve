# Conformance runner

`run.py` fires the ingest sink's five contract scenarios at a **live** Worker
URL over plain HTTP. It reuses the device's own crypto
(`beadz_camera.push.hmac_hex`, `beadz_camera.sign`) so the bytes it sends are
exactly what a real Fault-Cam Pi would send — no reimplementation, no drift.

This is the deterministic local acceptance gate for the Worker. Unlike the
`vitest` + `@cloudflare/vitest-pool-workers` suite in `service/test/`, it
works reliably on Windows: it is nothing but an HTTP client hitting a running
`wrangler dev`, so it sidesteps the file-handle/miniflare flakiness that
`vitest-pool-workers` hits on Windows.

## The five scenarios

1. Happy path — three frames, increasing counters, in order → `200`
2. Replay — resend an already-accepted counter → `409 counter_seen`
3. Tamper — `sha256` doesn't match the image bytes → `400 bad_signature`
4. Bad MAC — wrong `X-Beadz-Mac` → `401 bad_mac`
5. Unsupported protocol — `X-Beadz-Protocol: 99` → `400 unsupported_protocol`

## Setup (one-time per key)

Requires the camera package installed editable in the same venv:

```bash
pip install -e ../camera
pip install requests
```

`run.py` needs an Ed25519 signing key. Point `--key` at a path that doesn't
exist yet and it will be generated on first use (via
`beadz_camera.sign.generate_keypair`/`load_signing_key`), and its **public**
half is printed every run:

```
ED25519_PUBKEY = <hex> (set this in wrangler.toml [vars])
```

The Worker verifies Ed25519 signatures against `wrangler.toml`'s
`[vars] ED25519_PUBKEY`, so that value must be set to the pubkey printed
above for signatures to validate. The private key file matches `*.key` in
`.gitignore` — it is never committed.

## Two-terminal flow

**Terminal 1** — start the Worker locally, with the HMAC secret it expects
to see:

```bash
cd service
echo "HMAC_SECRET=conf-secret" > .dev.vars   # gitignored, never committed
npm run dev
```

Before the first real run, set `wrangler.toml`'s `[vars] ED25519_PUBKEY` to
the pubkey printed by `run.py` (see Setup above), then restart `wrangler dev`
so it picks up the new value.

**Terminal 2** — run the conformance suite against it:

```bash
cd service
python conformance/run.py \
  --url http://localhost:8787/api/ingest \
  --secret conf-secret \
  --key ./conformance/conf.key
```

Expected output: five `PASS` lines followed by `ALL PASS: 5/5`, exit code 0.

The same command works unmodified against a deployed Worker URL — swap
`--url` for the deployed `/api/ingest` endpoint and `--secret`/`--key` for
the deployed HMAC secret and device key. Counters are derived from the
current time (`base = int(time.time())`), so re-running against a
persistent Worker (one that remembers `last_seen`) still passes.
