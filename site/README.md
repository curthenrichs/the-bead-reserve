# Site: The Bead Reserve claim office

**Subsystem A, no-chain slice.** A static Astro site that presents the reserve
as a single page: masthead, reserve ledger, a verified seal, a live camera
monitor, a claim panel, a redemption panel, a newsletter signup, and
disclaimers. The interactive pieces are four React islands (camera monitor,
claim, redeem, newsletter); everything else is static Astro. Light theme in
keeping with the half-built-robots blog: white page, warm near-black text, and
an amber accent (`#ffaa3c`, or `#b5680c` for text on white), in Roboto Mono /
Roboto Serif. The camera monitor is a deliberately dark "screen" island. No
wallet connection, no chain reads, no new backend; this slice only renders. The
backend it eventually talks to is `../service`, a separate Cloudflare Worker
(subsystem B).

## House style

Rules the pages are expected to follow. They exist because each one has already
been got wrong once.

**Never cap prose width.** No `max-width`, no `ch` measures, no wrapper divs
that narrow text. The column set by `<main>` in `Base.astro` is the only width
authority, and paragraphs inherit it. This is a standing instruction from the
maintainer, not a preference to re-litigate. Sizing a non-prose element to its
content (a small data table, an image) is a different thing and is fine.

**Every page header uses `.masthead`.** It lives in `src/styles/tokens.css`
rather than in `Masthead.astro`, because Astro scopes component styles and a
second page cannot reuse them. The frame is 2px rules top and bottom plus 2px
vertical accent lines at the left and right edges that fade toward the middle.
A header that sets its own borders will silently lose those verticals and frame
differently from the rest of the site.

**Page titles read `The Bead Reserve : <Page>`,** with spaces around the colon.
The `<h1>` says the same thing, with `<em>` around `Reserve` so it picks up the
amber italic from `.masthead h1 em`.

**Footer nav lives in `Base.astro`** and is shared by every page: site root,
whitepaper, brand assets. A new page gets it for free and should not add its
own.

**Use the tokens.** Colors come from `src/styles/tokens.css`. Don't hardcode a
hex in a page; if a value is missing, add a token.

**Dark elements get their own surface.** The page is light. The camera monitor
and the reserve seal are dark-grounded and must sit on a dark panel rather than
directly on white.

**Copy register: dry and institutional.** State the thing and stop. No
marketing language, no em dashes, no rule-of-three lists, and no sentence
explaining why the reader should do what you just told them to do. The project's
humor comes from playing the reserve-bank bit straight, so anything that reads
as enthusiasm undercuts it. This matters most on outward-facing pages like
`/brand`, which press and listing venues read.

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
monitor shows its dark "signal interrupted, reserve remains sealed" state.
That's the honest default, not a bug; a failed or empty `/api/reserve` fetch
falls back to it.

## Testing

- **`npm test`**: Vitest + React Testing Library. Covers three of the four
  islands (`CameraMonitor`'s fresh/stale/dark states plus the poll-failure
  fallback, the disabled `ClaimPanel` stub, and `Subscribe`'s email validation
  and stub confirmation) and a static-content check that runs a real
  `astro build` and greps the emitted `dist/index.html` for the masthead,
  genesis-count, and collateralization text. `RedeemPanel` is a static stub
  mirroring `ClaimPanel` and has no dedicated test yet. Test files live in
  `test/`.
- **`npm run check`**: `astro check && tsc --noEmit`. Type-checks `.astro`
  files and the rest of the TypeScript/TSX tree.

## Build

```bash
npm run build
```

This runs the `prebuild` script (`scripts/build-whitepaper.mjs`) before
`astro build`:

1. Invokes `../whitepaper`'s own build (`build.ps1` on Windows via `pwsh`,
   falling back to `powershell.exe` if `pwsh` isn't on PATH; `build.sh` on
   Linux/macOS/CI). This needs **Typst 0.15+ on PATH**; see
   `../whitepaper/README.md` (or `build.ps1`'s header) if it's missing.
2. Copies the resulting `out/beadz-whitepaper.pdf` into `site/public/whitepaper.pdf`.
3. Refuses to proceed (exits non-zero) if the PDF didn't land, rather than
   shipping a dead `/whitepaper.pdf` link.

The whitepaper is linked twice from the page: an in-voice line in the masthead
and a link in the footer, both opening in a new tab. `astro build` then emits
the static site to `dist/`. `public/whitepaper.pdf` is gitignored; it's a build
artifact, regenerated every build, never committed.

`npm run preview` serves the built `dist/` locally if you want to check the
production output before deploying.

## What's stubbed

Three seams are deliberately incomplete in this slice, all waiting on the
contract being deployed:

- **`ClaimPanel`**: "Connect wallet" / "Claim your bead" buttons are rendered
  disabled with "Claim opens at launch." Wiring this up waits on the contract
  and a wagmi/viem connect flow; there's nothing to connect to yet.
- **`RedeemPanel`**: "Connect wallet" / "Redeem for beads" buttons rendered
  disabled with "Redemption opens at launch." The real flow burns BEADZ for a
  physical bead (irreversible; supply only shrinks) and captures a shipping
  address off-chain. The stubbed progress bar and copy stand in until the
  wallet slice reads chain.
- **`Subscribe`**: validates the email client-side and shows a confirmation
  message, but doesn't send anywhere. The `// WIRING:` comment in
  `src/islands/Subscribe.tsx` marks where a later slice POSTs to an ESP.

These are honest placeholders, not broken features; the copy and behavior are
what a visitor should see today.

## API integration

The site never talks to the chain and holds no secrets. It calls two read-only
endpoints served by the separate `../service` Worker:

- `GET /api/reserve`: the current reserve status (`fresh` / `stale` / `dark`,
  frame counter, timestamp, hash, Chief Reserve Officer caption text).
- `GET /api/frame/latest`: the latest camera frame, streamed straight from
  the Worker's storage.

In production these are same-origin: a Cloudflare route sends `/api/*` on the
site's domain to the Worker, so the browser never sees a second origin and
there's no CORS to configure. In dev, `astro.config.mjs`'s Vite proxy stands
in for that route, forwarding `/api/*` to a locally running `wrangler dev`
(see "Local dev" above).

## CI

`.github/workflows/site.yml` runs on pushes/PRs touching `site/**`,
`whitepaper/**`, or the workflow file itself, on `ubuntu-latest`: installs
Typst, `npm ci`, `npm run check`, `npm test`, `npm run build`. Test-only; it
doesn't deploy.

## Opsec

Static content only. No secrets live in this project (the Worker holds the
one secret, `HMAC_SECRET`, and that's `../service`'s concern, not this
site's). No bead images and no whitepaper PDF are ever committed here; the
PDF is a gitignored build artifact, and camera frames are fetched at runtime
from the Worker, never bundled into the site.
