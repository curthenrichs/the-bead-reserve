# Site: The Bead Reserve claim office

**Subsystem A, no-chain slice.** A static Astro site with three React islands,
presenting the reserve: masthead, ledger, a live camera monitor, a claim panel,
and a newsletter signup. Dark/amber brand (Roboto Mono / Roboto Serif, amber
`#ffaa3c` on `#1b140c`), matching the half-built-robots house style. No wallet
connection, no chain reads, no new backend — this slice only renders. The
backend it eventually talks to is `../service`, a separate Cloudflare Worker
(subsystem B).

## Local dev

```bash
npm install
npm run dev        # astro dev, prints a localhost URL
```

The `<CameraMonitor>` island polls `/api/reserve` and renders `/api/frame/latest`.
In dev, `astro.config.mjs` proxies `/api/*` to `http://localhost:8787`, so to see
a live feed instead of the placeholder, open a **second terminal** and run the
Worker alongside the site:

```bash
cd ../service
npm install
npm run dev         # wrangler dev on localhost:8787
```

Without the Worker running (or before any camera has ever pushed a frame), the
monitor shows its dark "signal interrupted — reserve remains sealed" state.
That's the honest default, not a bug — a failed or empty `/api/reserve` fetch
falls back to it.

## Testing

- **`npm test`** — Vitest + React Testing Library. Covers the three islands
  (`CameraMonitor`'s fresh/stale/dark states plus the poll-failure fallback,
  the disabled `ClaimPanel` stub, `Subscribe`'s email validation and stub
  confirmation) and a static-content check that runs a real `astro build` and
  greps the emitted `dist/index.html` for the masthead, genesis-count, and
  collateralization text. Test files live in `test/`.
- **`npm run check`** — `astro check && tsc --noEmit`. Type-checks `.astro`
  files and the rest of the TypeScript/TSX tree.

## Build

```bash
npm run build
```

This runs the `prebuild` script (`scripts/build-whitepaper.mjs`) before
`astro build`:

1. Invokes `../whitepaper`'s own build (`build.ps1` on Windows via `pwsh`,
   falling back to `powershell.exe` if `pwsh` isn't on PATH; `build.sh` on
   Linux/macOS/CI). This needs **Typst 0.15+ on PATH** — see
   `../whitepaper/README.md` (or `build.ps1`'s header) if it's missing.
2. Copies the resulting `out/beadz-whitepaper.pdf` into `site/public/whitepaper.pdf`.
3. Refuses to proceed (exits non-zero) if the PDF didn't land, rather than
   shipping a dead `/whitepaper.pdf` link.

`astro build` then emits the static site to `dist/`. `public/whitepaper.pdf` is
gitignored — it's a build artifact, regenerated every build, never committed.

`npm run preview` serves the built `dist/` locally if you want to check the
production output before deploying.

## What's stubbed

Two seams are deliberately incomplete in this slice:

- **`ClaimPanel`** — buttons ("Connect wallet", "Claim your bead") are
  rendered disabled with "Claim opens at launch." Wiring this up waits on the
  contract being deployed and a wagmi/viem connect flow; there's nothing to
  connect to yet.
- **`Subscribe`** — validates the email client-side and shows a confirmation
  message, but doesn't send anywhere. The `// WIRING:` comment in
  `src/islands/Subscribe.tsx` marks where a later slice POSTs to an ESP.

Both are honest placeholders, not broken features — the copy and behavior are
what a visitor should see today.

## API integration

The site never talks to the chain and holds no secrets. It calls two read-only
endpoints served by the separate `../service` Worker:

- `GET /api/reserve` — the current reserve status (`fresh` / `stale` / `dark`,
  frame counter, timestamp, hash, Chief Reserve Officer caption text).
- `GET /api/frame/latest` — the latest camera frame, streamed straight from
  the Worker's storage.

In production these are same-origin: a Cloudflare route sends `/api/*` on the
site's domain to the Worker, so the browser never sees a second origin and
there's no CORS to configure. In dev, `astro.config.mjs`'s Vite proxy stands
in for that route, forwarding `/api/*` to a locally running `wrangler dev`
(see "Local dev" above).

## CI

`.github/workflows/site.yml` runs on pushes/PRs touching `site/**`,
`whitepaper/**`, or the workflow file itself, on `ubuntu-latest`: installs
Typst, `npm ci`, `npm run check`, `npm test`, `npm run build`. Test-only — it
doesn't deploy.

## Opsec

Static content only. No secrets live in this project (the Worker holds the
one secret, `HMAC_SECRET`, and that's `../service`'s concern, not this
site's). No bead images and no whitepaper PDF are ever committed here — the
PDF is a gitignored build artifact, and camera frames are fetched at runtime
from the Worker, never bundled into the site.
