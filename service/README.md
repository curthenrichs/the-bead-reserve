# Service: BEADZ Ingest Worker

**Subsystem B proof of concept.** A Cloudflare Worker that ingests the camera's
signed frames and serves the viewer feed — the backend half of proof-of-reserves,
paired with `camera/`'s capture-and-sign half. TypeScript, zero runtime npm
dependencies: HMAC-SHA256, SHA-256, and Ed25519 verification are all native
`crypto.subtle` (WebCrypto), not a library.

Internal design spec (private, not part of this repository):
`docs/superpowers/specs/2026-07-19-service-poc-ingest-worker-design.md`.

This is a PoC: retiring the platform unknowns (wrangler, R2/KV bindings,
secrets, deploy, remote behavior) before a production subsystem-B spec, not
the production backend itself. It reproduces the camera's local ingest-sink
contract (`camera/scripts/ingest-sink.py`) byte-for-byte — same HMAC, same
Ed25519 message, same rejection order.

## Endpoints

### `POST /api/ingest`

Body: JSON `{counter, ts, sha256, sig, croText, image_b64}`. Header
`X-Beadz-Mac`: HMAC-SHA256 over the raw request body bytes. Checks run in
order, first failure wins:

| Check | Failure |
|---|---|
| HMAC over raw body bytes | `401 bad_mac` |
| `X-Beadz-Protocol` (if present) is supported (absent ⇒ `"1"`) | `400 unsupported_protocol` |
| JSON parses, full type/shape contract, valid base64 | `400 bad_request` |
| SHA-256(decoded image) matches `sha256`, and Ed25519 verifies over that hash | `400 bad_signature` |
| `counter > last_seen` | `409 counter_seen` |
| — accept: image → R2, metadata → KV `latest`/`last_seen` | `200 {ok: true, counter}` |

Timestamp skew beyond ±10 min is logged, never rejected. No client input,
authenticated or not, produces a `500` — only a genuine storage failure does.

### `GET /api/reserve`

JSON: `{frameUrl, counter, ts, sha256, sig, croText, status, apiVersion}`.
`status` is a three-state freshness read off `ts`: `fresh` / `stale` / `dark`
(thresholds are the `FRESH_MAX_S` / `STALE_MAX_S` vars below). Nothing ever
pushed yet is a valid state, not an error: `status: "dark"`, other fields
`null`, HTTP `200`.

### `GET /api/frame/latest`

Streams the latest JPEG straight out of R2 (`Content-Type: image/jpeg`). No
public bucket, no custom domain — the Worker is the only path to the bytes.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # gitignored; set HMAC_SECRET to any value
npm run dev                      # wrangler dev on http://localhost:8787
```

`wrangler dev` simulates R2/KV locally (state persists under `.wrangler/`).
No Cloudflare account is needed for this step.

## Testing

Two gates, deliberately redundant:

- **`npm test`** runs the Vitest suite (`test/*.test.ts`) inside workerd via
  `@cloudflare/vitest-pool-workers` — crypto, router, ingest, and reserve
  specs. This is the fast inner loop and the CI gate.

  **Windows note:** the R2-touching suites (`ingest.test.ts`,
  `reserve.test.ts`) intermittently crash the test harness with an `EBUSY`
  error while miniflare tears down its R2 SQLite storage. This is a known
  `@cloudflare/vitest-pool-workers`-on-Windows limitation, not a code fault —
  `crypto.test.ts` and `router.test.ts` are unaffected, and the full suite is
  reliable on Linux/CI. Re-run on a flake.

- **`conformance/run.py`** fires the camera's own five contract scenarios
  (happy path, replay, tamper, bad MAC, unsupported protocol) at a live
  `wrangler dev` over plain HTTP, using the camera package's own HMAC/Ed25519
  code — no reimplementation, no drift. Because it's nothing but an HTTP
  client against a running server, it has no isolated-storage teardown to
  race, and it is **the Windows-reliable, deterministic local gate** — the
  recommended way to verify the full ingest contract on this platform. See
  `conformance/README.md` for the two-terminal setup and expected output.

## Deploy

Requires a Cloudflare account and interactive login; this is operator-run,
not part of any test suite.

```bash
wrangler login
wrangler r2 bucket create beadz-frames
wrangler kv namespace create META        # paste the returned id into wrangler.toml [[kv_namespaces]]
wrangler secret put HMAC_SECRET          # same secret the camera device pushes with
# set [vars] ED25519_PUBKEY in wrangler.toml to the real device key's public half
wrangler deploy                          # -> https://<name>.<account>.workers.dev
```

Verify the deploy with `conformance/run.py` pointed at the deployed
`/api/ingest` URL (see `conformance/README.md`'s note on reusing the same
command against a live Worker), then watch live traffic with `wrangler tail`.

## The KV consistency caveat

The `409 counter_seen` replay guard reads `last_seen` from KV, which is
**eventually consistent** (~60 s propagation across edge locations) — unlike
the camera's own file-backed counter, which is strict. For a single polite
writer pushing roughly hourly this is fine for a PoC; a production
subsystem-B build has to decide explicitly whether to accept that window or
move the counter to a Durable Object / R2 conditional write for a strict
guarantee. Not yet done here.

## Opsec

Only `HMAC_SECRET` is a secret — `wrangler secret put` in deployment,
`.dev.vars` (gitignored) locally, never git. The Ed25519 **public** key in
`wrangler.toml`'s `[vars] ED25519_PUBKEY` is meant to be public — publishing
it is how anyone verifies a frame. No bead images and no secrets are ever
committed to this repository: frames are EXIF-stripped and tightly cropped
**on the camera device** before signing, and this Worker stores exactly the
signed bytes it receives — it never sees, and could not leak, anything more.
