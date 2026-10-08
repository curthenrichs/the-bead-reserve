# Site: The Bead Reserve claim office

**Subsystem A, no-chain slice.** A static Astro 5 site on the @half-built
design system (`@half-built/css`, `@half-built/astro`, `@half-built/tooling`,
all pinned at 0.12.0). It presents the reserve as a single page: header, reserve
ledger, a verified seal, a live camera monitor, a claim panel, a redemption
panel, a newsletter signup, and disclaimers, plus a `/brand` page. There is no
React. The camera monitor is the one script-driven piece, and it is plain
TypeScript under `src/scripts`. No wallet connection, no chain reads, no new
backend; this slice only renders. The backend it eventually talks to is
`../service`, a separate Cloudflare Worker (subsystem B).

## House style

Rules the pages are expected to follow. They exist because each one has already
been got wrong once.

**Never cap prose width.** No `max-width`, no `ch` measures, no wrapper divs
that narrow text. The column set by the package layout is the only width
authority, and paragraphs inherit it. This is a standing instruction from the
maintainer, not a preference to re-litigate. Sizing a non-prose element to its
content (a small data table, an image) is a different thing and is fine.

**Every page uses `Layout.astro`.** It wraps the package `Shell`, `SiteHeader`,
and `Footer`, and a page owns its own `<main>`. A new page gets the header,
footer, and theme toggle for free and does not add its own.

**Page titles read `The Bead Reserve : <Page>`,** with spaces around the colon.
The page opens with the receipt `<h1>` (`ReceiptHeader.astro`), which says the
same thing with `<em>` around `Reserve`.

**Colors come only from @half-built tokens.** `test/no-hex.test.ts` fails on any
hex literal in `src/`. Brand palette values live in `brand/palette.mjs`, outside
`src`. If a token is missing, fix the choice, do not add a hex.

**`--beadz-font-display` is the one local token.** It is the serif used by the
wordmark and the receipt heading. Everything else is a @half-built token.

**Components.** Site-specific components stay in `src/components`. A generic
component goes to `half-built-ui` first and arrives here by a version bump.

**Dark elements get their own surface.** The camera monitor and the reserve seal
are dark-grounded and sit on a dark panel in both themes.

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

The camera monitor polls `/api/reserve` and renders `/api/frame/latest`.
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

- **`npm test`**: Vitest. Unit tests for the camera state and monitor DOM, the
  panels, content, and head tags, plus suites that run a real `astro build` and
  read `dist/`: html-validate over every built page, the manifest, the token
  list, the whitepaper palette, and the hex guard over `src/`.
- **`npm run test:browser`**: headless Chrome against `astro preview` of the
  built `dist/` (ports 4351 and 4352). It checks layout, runs axe-core (WCAG
  2.2 A and AA) on each page in both themes and at phone width, and walks the
  Tab order of the home page to confirm every stop, the seal included, shows a
  focus ring. Run `npm run build` first or let the global setup do it.
- **`npm run check`**: `astro check && tsc --noEmit`.
- **`npm run lint`**: stylelint, eslint, and prettier from `@half-built/tooling`.
  `npm run lint:fix` applies the fixes.

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

The whitepaper is linked from the header navigation, the footer, and an
in-voice line on the home page. `astro build` then emits
the static site to `dist/`. `public/whitepaper.pdf` is gitignored; it's a build
artifact, regenerated every build, never committed.

`npm run preview` serves the built `dist/` locally if you want to check the
production output before deploying.

## What's stubbed

Two seams are deliberately incomplete in this slice, waiting on the contract
being deployed:

- **`ClaimPanel`**: "Connect wallet" / "Claim your bead" buttons are rendered
  disabled with "Claim opens at launch." Wiring this up waits on the contract
  and a wallet connect flow; there is nothing to connect to yet.
- **`RedeemPanel`**: "Connect wallet" / "Redeem for beads" buttons rendered
  disabled with "Redemption opens at launch." The real flow burns BEADZ for a
  physical bead (irreversible; supply only shrinks) and captures a shipping
  address off-chain.

The panels are static. Subscribe is live: it posts to the shared Buttondown
list that the half-built-robots blog uses. These are honest placeholders, not
broken features; the copy and behavior are what a visitor should see today.

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
`whitepaper/**`, or the workflow file itself, on `ubuntu-latest` with Node 22:
installs Typst, `npm ci`, `npm run check`, `npm run lint`, `npm test`, the
brand-drift check, `npm run build`, and `npm run test:browser`. Test-only; it
doesn't deploy.

## Opsec

Static content only. No secrets live in this project (the Worker holds the
one secret, `HMAC_SECRET`, and that's `../service`'s concern, not this
site's). No bead images and no whitepaper PDF are ever committed here; the
PDF is a gitignored build artifact, and camera frames are fetched at runtime
from the Worker, never bundled into the site.
