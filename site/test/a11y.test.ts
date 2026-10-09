/* Accessibility regression suite for the BEADZ site (facelift spec,
   2026-10-06). Runs axe-core in a real headless Chrome against the built
   dist, over one page per template in both themes (contrast is
   theme-dependent) and at phone width where the chrome reflows, and walks
   the keyboard focus order of the home page to prove every stop shows a
   ring, the seal included.

   Off by default: vitest.config.ts excludes it, and
   vitest.browser.config.ts (`npm run test:browser`) runs it. Own port
   because vitest runs test files in parallel workers and browser.test.ts
   owns 4351. Rendered-page checks only: html-validate already covers the
   static markup of every built page. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createRequire } from "node:module";
import type { ChildProcess } from "node:child_process";
import type { Browser, Page } from "puppeteer-core";
import type { AxeResults, RunOptions } from "axe-core";
import {
  startPreview,
  stopPreview,
  launchChrome,
  desktopPage,
  phonePage,
} from "@half-built/tooling/test-kit/browser-server.ts";
import { stubLiveReserve } from "./stub-api";

const PORT = 4352;
const ORIGIN = `http://localhost:${PORT}`;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

/* One page per template plus every policy page (the audit scanned
   those by URL). Add a path here when a new template lands, not a new
   post: axe on a representative page is the regression class this
   suite exists for, and the whole-site sweep stays with html-validate. */
const PAGES = [
  "/",
  "/brand/",
  "/privacy/",
  "/accessibility/",
  "/terms/",
  "/nope/",
];

/* The phone chrome is a different DOM (collapsed nav, footer details
   closed), so the two templates that change most get a second pass. */
const PHONE_PAGES = ["/", "/brand/"];

/* WCAG 2.2 A and AA, which is the target the statement names.
   axe's best-practice rules are deliberately left out so a failure
   here always maps to a success criterion. */
const RUN: RunOptions = {
  runOnly: {
    type: "tag",
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"],
  },
  resultTypes: ["violations"],
};

/* axe.min.js attaches itself to window; declared here so the evaluate
   callbacks type-check without an `any`. */
declare const axe: {
  run(context: Document, options: RunOptions): Promise<AxeResults>;
};

interface Violation {
  id: string;
  impact: string | null | undefined;
  help: string;
  helpUrl: string;
  targets: string[];
}

async function runAxe(page: Page): Promise<Violation[]> {
  return page.evaluate(async (opts: RunOptions) => {
    const r = await axe.run(document, opts);
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      /* The first few offenders by selector: enough to find them, short
         enough that a template-wide miss does not print every card. */
      targets: v.nodes.slice(0, 5).map((n) => n.target.map(String).join(" ")),
    }));
  }, RUN);
}

function report(path: string, theme: string, violations: Violation[]): string {
  const lines = violations.map(
    (v) =>
      `  ${v.id} [${v.impact ?? "?"}] ${v.help}\n    ${v.helpUrl}\n${v.targets.map((t) => `    - ${t}`).join("\n")}`,
  );

  return `${path} (${theme}) axe violations:\n${lines.join("\n")}`;
}

describe("accessibility", () => {
  let browser: Browser | undefined;
  let server: ChildProcess | undefined;
  let page: Page | undefined;

  beforeAll(async () => {
    server = await startPreview(PORT, "/");
    browser = await launchChrome();
  }, 90_000);

  afterAll(async () => {
    try {
      await browser?.close();
    } finally {
      stopPreview(server);
    }
  });

  afterEach(async () => {
    await page?.close();
    page = undefined;
  });

  async function open(
    path: string,
    phone = false,
    live = false,
  ): Promise<Page> {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    const p = phone ? await phonePage(browser) : await desktopPage(browser);
    page = p;
    if (live) await stubLiveReserve(p);
    /* networkidle0: the islands mount from module scripts with no DOM
       marker to wait on, and axe must see the mounted DOM. */
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });

    /* Colors must be settled when axe reads them: the site transitions
       color on theme change, and a flip mid-transition once produced
       interpolated values that failed contrast on the wrong elements. */
    await p.addStyleTag({
      content:
        "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });

    await p.addScriptTag({ path: AXE });
    return p;
  }

  /* Both themes on one loaded page: the toggle is a data attribute on
     the root (theme-toggle.ts), so flipping it and re-running axe is
     the same DOM under the other palette. Light is forced, not assumed:
     the head stamp follows prefers-color-scheme when nothing is stored,
     so on a dark-mode machine the page arrives dark and an unforced
     "light" pass audits dark twice (how the 1.9:1 tagline passed
     locally and failed on the runner, 2026-09-03). */
  async function bothThemes(p: Page, path: string): Promise<void> {
    await p.evaluate(() => {
      delete document.documentElement.dataset.theme;
    });

    const light = await runAxe(p);
    expect(light, report(path, "light", light)).toEqual([]);

    await p.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });

    const dark = await runAxe(p);
    expect(dark, report(path, "dark", dark)).toEqual([]);
  }

  /* The guard on the guard: a page with a planted violation must fail,
     or a silently broken axe injection would pass every page below. */
  it("axe sees a planted violation", async () => {
    const p = await open("/");

    await p.evaluate(() => {
      const img = document.createElement("img");
      img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
      document.querySelector("main")?.append(img);
    });

    const found = await runAxe(p);
    expect(found.map((v) => v.id)).toContain("image-alt");
  }, 60_000);

  for (const path of PAGES) {
    it(`${path} has no WCAG 2.2 AA violations in either theme`, async () => {
      const p = await open(path);
      await bothThemes(p, path);
    }, 60_000);
  }

  /* Phones close the footer's collapsible sitemap groups, so the pass
     opens every group first: a closed group's links are not audited. */
  for (const path of PHONE_PAGES) {
    it(`${path} has no WCAG 2.2 AA violations at phone width`, async () => {
      const p = await open(path, true);

      await p.evaluate(() => {
        for (const d of document.querySelectorAll<HTMLDetailsElement>(
          "details.footer-sitemap-collapsible",
        )) {
          d.open = true;
        }
      });

      await bothThemes(p, `${path} @390`);
    }, 60_000);
  }

  /* The fine print highlighted as the jump target of a note reference:
     the muted ink must still read on the band. */
  it("/#note-1 (the targeted note) has no WCAG 2.2 AA violations in either theme", async () => {
    const p = await open("/#note-1");
    await bothThemes(p, "/#note-1");
  }, 60_000);

  /* The camera frame's lightbox, open over a stubbed live reserve
     (stub-api.ts), at desktop and phone width. */
  for (const phone of [false, true]) {
    it(`the open frame lightbox has no WCAG 2.2 AA violations${phone ? " at phone width" : ""}`, async () => {
      const p = await open("/", phone, true);
      const link = await p.waitForSelector("[data-cm-screen] a.lightbox-link");
      await link?.scrollIntoView();
      await link?.click();
      await p.waitForSelector("dialog.lb-dialog[open] .lb-img");
      await bothThemes(p, `/ lightbox${phone ? " @390" : ""}`);
    }, 60_000);
  }

  /* axe cannot see focus rings. Tab is a real keyboard event, so every
     stop matches :focus-visible and must show the site ring (reset.css)
     or a box-shadow ring (the patterns.css vocabulary). Walks until the
     order wraps back to the document or the budget runs out; the home
     page has the full chrome plus the seal, the monitor, and the forms,
     which is the whole focusable vocabulary of this site. */
  it("every Tab stop on the home page shows a visible focus ring", async () => {
    const p = await open("/");
    const missing: string[] = [];
    const seen = new Set<string>();
    let sawSeal = false;

    for (let i = 0; i < 120; i++) {
      await p.keyboard.press("Tab");

      const stop = await p.evaluate(() => {
        const el = document.activeElement;

        if (!el || el === document.body || el === document.documentElement) {
          return null;
        }

        const s = getComputedStyle(el);

        const ringed =
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          s.boxShadow !== "none";

        return {
          key: `${el.outerHTML.slice(0, 120)}@${Math.round(el.getBoundingClientRect().top + window.scrollY)}`,
          ringed,
          seal: !!el.closest(".seal"),
        };
      });

      if (!stop || seen.has(stop.key)) break;
      seen.add(stop.key);
      if (stop.seal) sawSeal = true;
      if (!stop.ringed) missing.push(stop.key);
    }

    expect(
      seen.size,
      "the Tab walk never left the document body",
    ).toBeGreaterThan(5);

    expect(sawSeal, "the seal was not among the Tab stops").toBe(true);

    expect(
      missing,
      `focus stops with no visible ring:\n${missing.join("\n")}`,
    ).toEqual([]);
  }, 60_000);
});
