/* Rendered-layout checks that jsdom cannot make, against the built
   dist in a real Chrome. Run by `npm run test:browser` after a build. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { Browser, Page } from "puppeteer-core";
import {
  startPreview,
  stopPreview,
  launchChrome,
  desktopPage,
  phonePage,
} from "@half-built/tooling/test-kit/browser-server.ts";
import { stubLiveReserve } from "./stub-api";

const PORT = 4351;
const ORIGIN = `http://localhost:${PORT}`;

describe("layout in a real browser", () => {
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
    path = "/",
    { phone = false, live = false, attested = false } = {},
  ): Promise<Page> {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    page = phone ? await phonePage(browser) : await desktopPage(browser);
    if (live || attested) await stubLiveReserve(page, { attested });
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
    return page;
  }

  interface Box {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  const box = (p: Page, sel: string): Promise<Box> =>
    p.$eval(sel, (e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });

  const intersects = (a: Box, b: Box): boolean =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;

  /* The page sets scroll-behavior: smooth, so a plain scrollTo is still
     in flight when the boxes are read. Jump instantly, then let a frame
     land. */
  async function scrollToEnd(p: Page): Promise<void> {
    await p.evaluate(async () => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      });

      await new Promise((r) =>
        requestAnimationFrame(() => {
          r(null);
        }),
      );
    });
  }

  async function sized(width: number, height: number, phone = false) {
    const p = await open("/", { phone });
    if (!phone) await p.setViewport({ width, height });

    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => {
            r(null);
          }),
        ),
    );

    return p;
  }

  const sealState = (p: Page) =>
    p.evaluate(() => {
      const s = document.querySelector(".seal");
      if (!s) return null;
      const cs = getComputedStyle(s);
      return {
        position: cs.position,
        display: cs.display,
        dock: getComputedStyle(document.documentElement)
          .getPropertyValue("--dock-bottom")
          .trim(),
      };
    });

  it("wide screens: the seal floats in the left gutter, clear of content and footer links", async () => {
    const p = await sized(1920, 1080);
    expect((await sealState(p))?.position).toBe("fixed");
    await scrollToEnd(p);
    const seal = await box(p, ".seal");
    const main = await box(p, "main");

    expect(seal.right, JSON.stringify({ seal, main })).toBeLessThanOrEqual(
      main.left,
    );

    expect(seal.left).toBeGreaterThanOrEqual(0);

    const links = await p.evaluate(() =>
      [...document.querySelectorAll("footer a")].map((a) => {
        const r = a.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    );

    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(intersects(seal, l)).toBe(false);
  });

  /* Wide screens: the floating seal travels down the gutter with the
     scroll, from under the header at the top of the page to its 30px
     bottom inset at the end (a CSS scroll timeline, owner call
     2026-10-08). */
  async function scrollToFraction(p: Page, f: number): Promise<void> {
    await p.evaluate(async (frac) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;

      window.scrollTo({ top: max * frac, behavior: "instant" });

      await new Promise((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            r(null);
          }),
        ),
      );
    }, f);
  }

  const SEAL_START = 272;
  const SEAL_INSET = 30;

  it("wide screens: the seal travels from under the header to the bottom as the page scrolls", async () => {
    const p = await sized(1920, 1080);
    const vh = 1080;

    await scrollToFraction(p, 0);
    const top = await box(p, ".seal");
    const header = await box(p, "header#masthead");

    expect(
      Math.abs(top.top - SEAL_START),
      JSON.stringify(top),
    ).toBeLessThanOrEqual(2);

    expect(intersects(top, header), JSON.stringify({ top, header })).toBe(
      false,
    );

    expect(intersects(top, await box(p, "main"))).toBe(false);

    await scrollToFraction(p, 0.5);
    const mid = await box(p, ".seal");
    expect(mid.top).toBeGreaterThan(SEAL_START + 20);
    expect(mid.bottom).toBeLessThan(vh - SEAL_INSET - 20);
    expect(intersects(mid, await box(p, "main"))).toBe(false);

    await scrollToFraction(p, 1);
    const end = await box(p, ".seal");

    expect(
      Math.abs(vh - end.bottom - SEAL_INSET),
      JSON.stringify(end),
    ).toBeLessThanOrEqual(2);

    expect(intersects(end, await box(p, "main"))).toBe(false);
  });

  it("wide screens, reduced motion: the seal stays at the bottom", async () => {
    const p = await sized(1920, 1080);

    await p.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);

    await scrollToFraction(p, 0);
    const seal = await box(p, ".seal");
    expect(Math.abs(1080 - seal.bottom - SEAL_INSET)).toBeLessThanOrEqual(2);
  });

  it("wide screens: the traveling seal still flips on focus, with the focus ring", async () => {
    const p = await sized(1920, 1080);
    await scrollToFraction(p, 0.5);
    await p.focus(".seal");

    const state = await p.evaluate(
      () =>
        new Promise<{ ring: string; flipped: boolean }>((r) => {
          setTimeout(() => {
            const s = document.querySelector(".seal");
            const inner = s?.querySelector(".seal-inner");
            const cs = s ? getComputedStyle(s) : null;

            r({
              ring: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : "",
              flipped: !!inner && getComputedStyle(inner).transform !== "none",
            });
          }, 700);
        }),
    );

    expect(state.flipped).toBe(true);
    expect(state.ring).not.toMatch(/^none/);
    expect(state.ring).not.toMatch(/ 0px$/);
  });

  it("narrower screens: the seal sits inline between the signature and the newsletter", async () => {
    const p = await sized(1280, 900);
    const state = await sealState(p);
    expect(["static", "relative"]).toContain(state?.position);
    expect(["", "0px"]).toContain(state?.dock);
    const seal = await box(p, ".seal");
    const sig = await box(p, ".signature");
    const gap = await box(p, ".subscribe-gap");
    expect(seal.top).toBeGreaterThan(sig.bottom);
    expect(seal.bottom).toBeLessThan(gap.top);
  });

  it("phones: the seal is shown inline in the same place", async () => {
    const p = await sized(0, 0, true);
    const state = await sealState(p);
    expect(state?.display).not.toBe("none");
    expect(["static", "relative"]).toContain(state?.position);
    const seal = await box(p, ".seal");
    const sig = await box(p, ".signature");
    const gap = await box(p, ".subscribe-gap");
    expect(seal.top).toBeGreaterThan(sig.bottom);
    expect(seal.bottom).toBeLessThan(gap.top);
  });

  it("the monitor is at most 640px wide and centered in main", async () => {
    const p = await open();
    const m = await box(p, "[data-camera-monitor]");
    const main = await box(p, "main");

    expect(m.right - m.left).toBeLessThanOrEqual(640);

    expect(
      Math.abs(m.left - main.left - (main.right - m.right)),
      JSON.stringify({ m, main }),
    ).toBeLessThanOrEqual(1);
  });

  /* Enlarge moves the whole monitor (bar, CRO row, screen, caption)
     into the package plate modal and back. The preview has no Worker,
     so the plain runs are the dark state; stub-api.ts stands in for a
     live reserve in the third. */
  for (const { path, phone, live } of [
    { path: "/", phone: false, live: false },
    { path: "/", phone: true, live: false },
    { path: "/", phone: false, live: true },
    { path: "/fault-cam/", phone: false, live: true },
    { path: "/fault-cam/", phone: true, live: false },
  ]) {
    it(`${path}: Enlarge pops the whole monitor out and Escape puts it back${phone ? " (phone)" : ""}${live ? " (live)" : " (dark)"}`, async () => {
      const p = await open(path, { phone, live });

      /* Where the monitor lives in the page, to check it comes back
         there: section III on the home page, main on /fault-cam/. */
      const home = await p.$eval(
        "[data-camera-monitor]",
        (m) =>
          m.parentElement?.getAttribute("aria-labelledby") ??
          m.parentElement?.tagName,
      );

      if (live) await p.waitForSelector("[data-cm-screen] img.cm-frame");
      const before = await box(p, "[data-camera-monitor]");
      const btn = await p.waitForSelector("[data-camera-monitor] .cm-enlarge");

      expect(
        await p.$eval(".cm-enlarge", (b) => [
          b.getAttribute("type"),
          b.getAttribute("aria-haspopup"),
          b.textContent.trim(),
        ]),
      ).toEqual(["button", "dialog", "Enlarge the reserve monitor"]);

      /* An icon box at the monitor's top-right corner: straddling it on
         desktop, the way the plate's close box straddles the plate, and
         tucked inside the corner on phones. */
      const corner = await box(p, "[data-camera-monitor] .cm-enlarge");

      expect(corner.bottom - corner.top).toBeCloseTo(30, 0);

      if (phone) {
        expect(corner.right).toBeLessThanOrEqual(before.right);
        expect(before.right - corner.right).toBeLessThanOrEqual(20);
      } else {
        expect(Math.abs(corner.right - before.right - 17)).toBeLessThanOrEqual(
          1,
        );
      }

      expect(Math.abs(corner.top - before.top + 17)).toBeLessThanOrEqual(1);

      /* The bar's badge, and whatever sits above the monitor, stay
         clear of the corner box. */
      const badge = await box(p, "[data-cm-badge]");
      expect(intersects(badge, corner)).toBe(false);

      const above = await p.$eval("[data-camera-monitor]", (m) => {
        const r = m.previousElementSibling?.getBoundingClientRect();
        return r ? r.bottom : -Infinity;
      });

      expect(corner.top).toBeGreaterThan(above);

      await btn?.scrollIntoView();
      await btn?.click();
      await p.waitForSelector("dialog[open] [data-camera-monitor]");

      const inPlate = await p.evaluate(() => {
        const dlg = document.querySelector("dialog[open]");
        const m = document.querySelector("[data-camera-monitor]");
        const plate = m?.closest(".pm-plate");
        const btn = m?.querySelector<HTMLElement>(".cm-enlarge");
        const r = m?.getBoundingClientRect();
        const pr = plate?.getBoundingClientRect();
        const screen = m?.querySelector("[data-cm-screen]");
        const sr = screen?.getBoundingClientRect();

        return {
          label: dlg?.getAttribute("aria-label"),
          inPlate: !!plate,
          w: r?.width ?? 0,
          plateW: pr?.width ?? 0,
          ratio: sr ? sr.width / sr.height : 0,
          enlargeShown: !!btn && getComputedStyle(btn).display !== "none",
          bar: !!m?.querySelector(".cm-bar"),
          caption: !!m?.querySelector("[data-cm-caption]"),
          placeholderInMain: !!document.querySelector("main [data-cm-slot]"),
          vw: document.documentElement.clientWidth,
        };
      });

      expect(inPlate.label).toBe("Reserve monitor");
      expect(inPlate.inPlate).toBe(true);
      expect(inPlate.bar && inPlate.caption).toBe(true);
      expect(inPlate.enlargeShown).toBe(false);
      expect(inPlate.placeholderInMain).toBe(true);
      expect(Math.abs(inPlate.ratio - 1.6)).toBeLessThan(0.02);

      if (phone) {
        expect(inPlate.w).toBeGreaterThan(inPlate.plateW - 40);
      } else {
        expect(inPlate.w).toBeGreaterThan(640);
      }

      expect(inPlate.w).toBeLessThanOrEqual(inPlate.vw);

      /* The page under the veil keeps its height: the slot holds the
         monitor's place. */
      const slot = await box(p, "main [data-cm-slot]");

      expect(
        Math.abs(slot.bottom - slot.top - (before.bottom - before.top)),
      ).toBeLessThanOrEqual(1);

      await p.keyboard.press("Escape");
      await p.waitForSelector("dialog[open]", { hidden: true });

      /* The dialog's close event is a queued task, so the move back
         lands a moment after the dialog shuts. */
      await p.waitForSelector("[data-cm-slot]", { hidden: true });

      const after = await p.evaluate(() => {
        const m = document.querySelector("[data-camera-monitor]");
        const b = m?.querySelector(".cm-enlarge");
        return {
          parent:
            m?.parentElement?.getAttribute("aria-labelledby") ??
            m?.parentElement?.tagName,
          slot: !!document.querySelector("[data-cm-slot]"),
          focused: document.activeElement?.classList.contains("cm-enlarge"),
          enlargeShown: !!b && getComputedStyle(b).display !== "none",
        };
      });

      expect(after).toEqual({
        parent: home,
        slot: false,
        focused: true,
        enlargeShown: true,
      });

      const back = await box(p, "[data-camera-monitor]");

      expect(
        Math.abs(back.right - back.left - (before.right - before.left)),
      ).toBeLessThanOrEqual(1);
    });
  }

  it("the home monitor sits in section III", async () => {
    const p = await open();

    expect(
      await p.$eval("[data-camera-monitor]", (m) =>
        m.closest("section.panel")?.getAttribute("aria-labelledby"),
      ),
    ).toBe("observation-heading");
  });

  it("/fault-cam/: the monitor is wider than the home page's, at most 960px, centered", async () => {
    const p = await open("/fault-cam/");
    const m = await box(p, "[data-camera-monitor]");
    const main = await box(p, "main");
    const w = m.right - m.left;
    expect(w, JSON.stringify({ m, main })).toBeGreaterThan(640);
    expect(w).toBeLessThanOrEqual(960);

    expect(
      Math.abs(m.left - main.left - (main.right - m.right)),
    ).toBeLessThanOrEqual(1);
  });

  const sideways = (p: Page) =>
    p.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );

  /* stub-api.ts serves a real hash with a signature of zeros, so the
     in-browser check runs end to end (Ed25519 in this Chrome) and
     must refuse it. */
  it("/fault-cam/: the record fills from the poll and the browser check runs", async () => {
    const p = await open("/fault-cam/", { attested: true });

    await p.waitForFunction(
      () =>
        document.querySelector('[data-at="verdict"]')?.textContent ===
        "Signature invalid",
      { timeout: 10_000 },
    );

    const rec = await p.evaluate(() => {
      const out: Record<string, string> = {};

      for (const d of document.querySelectorAll("[data-at]")) {
        out[d.getAttribute("data-at") ?? ""] = d.textContent.trim();
      }

      return out;
    });

    expect(rec).toMatchObject({
      counter: "8",
      captured: "2026-09-21T14:13:20Z",
      status: "fresh",
      sig: "00".repeat(64),
    });

    expect(rec.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await sideways(p)).toBeLessThanOrEqual(0);
  });

  it("/fault-cam/ at phone width: the hex wraps, no sideways scroll", async () => {
    const p = await open("/fault-cam/", { phone: true, attested: true });

    await p.waitForFunction(
      () => document.querySelector('[data-at="counter"]')?.textContent === "8",
    );

    expect(await sideways(p)).toBeLessThanOrEqual(0);
  });

  const mid = (b: Box) => (b.left + b.right) / 2;

  /* Owner call 2026-10-08: the two buttons centered on the column, the
     launch note centered on its own line beneath them. */
  it("panel actions: buttons centered on the column, the note centered below them", async () => {
    const p = await open();
    const center = mid(await box(p, "main"));

    const groups = await p.$$eval(".panel-actions", (els) =>
      els.map((g) => {
        const r = (e: Element) => {
          const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
        };

        return {
          buttons: [...g.querySelectorAll(".panel-button")].map(r),
          note: r(g.querySelector(".panel-note") ?? g),
        };
      }),
    );

    expect(groups).toHaveLength(2);

    for (const { buttons, note } of groups) {
      expect(buttons).toHaveLength(2);
      const [a, b] = buttons;
      expect(Math.abs((mid(a) + mid(b)) / 2 - center)).toBeLessThanOrEqual(2);
      expect(note.top).toBeGreaterThanOrEqual(Math.max(a.bottom, b.bottom));
      expect(Math.abs(mid(note) - center)).toBeLessThanOrEqual(2);
    }
  });

  it("panel actions on phones: still centered, button by button when they wrap", async () => {
    const p = await open("/", { phone: true });
    const center = mid(await box(p, "main"));

    const rows = await p.$$eval(".panel-actions", (els) =>
      els.map((g) =>
        [...g.querySelectorAll(".panel-button, .panel-note")].map((e) => {
          const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
        }),
      ),
    );

    for (const [a, b, note] of rows) {
      if (Math.abs(a.top - b.top) > 1) {
        expect(Math.abs(mid(a) - center)).toBeLessThanOrEqual(2);
        expect(Math.abs(mid(b) - center)).toBeLessThanOrEqual(2);
      } else {
        expect(Math.abs((mid(a) + mid(b)) / 2 - center)).toBeLessThanOrEqual(2);
      }

      expect(Math.abs(mid(note) - center)).toBeLessThanOrEqual(2);
    }
  });

  /* Owner call 2026-10-08: room above the eyebrow, and the receipt h1
     one step under the header wordmark it repeats. */
  for (const path of ["/", "/fault-cam/", "/brand/"]) {
    for (const phone of [false, true]) {
      it(`${path}: the receipt clears the header and its h1 sits under the wordmark${phone ? " (phone)" : ""}`, async () => {
        const p = await open(path, { phone });

        const r = await p.evaluate(() => {
          const px = (sel: string, prop: "marginTop" | "fontSize") => {
            const e = document.querySelector(sel);
            return e ? parseFloat(getComputedStyle(e)[prop]) : NaN;
          };

          const h1 = document.querySelector(".receipt-title");

          return {
            marginTop: px(".receipt", "marginTop"),
            h1: px(".receipt-title", "fontSize"),
            mark: px(".beadz-wordmark", "fontSize"),
            h1Overflow: h1 ? h1.scrollWidth - h1.clientWidth : NaN,
          };
        });

        expect(r.marginTop).toBeGreaterThanOrEqual(24);
        expect(r.h1).toBeLessThan(r.mark);
        expect(r.h1Overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
