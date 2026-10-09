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
    { phone = false, live = false } = {},
  ): Promise<Page> {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    page = phone ? await phonePage(browser) : await desktopPage(browser);
    if (live) await stubLiveReserve(page);
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
  for (const { phone, live } of [
    { phone: false, live: false },
    { phone: true, live: false },
    { phone: false, live: true },
  ]) {
    it(`Enlarge pops the whole monitor out and Escape puts it back${phone ? " (phone)" : ""}${live ? " (live)" : " (dark)"}`, async () => {
      const p = await open("/", { phone, live });
      if (live) await p.waitForSelector("[data-cm-screen] img.cm-frame");
      const before = await box(p, "[data-camera-monitor]");
      const btn = await p.waitForSelector("[data-camera-monitor] .cm-enlarge");

      expect(
        await p.$eval(".cm-enlarge", (b) => [
          b.getAttribute("type"),
          b.getAttribute("aria-haspopup"),
          b.textContent.trim(),
        ]),
      ).toEqual(["button", "dialog", "Enlarge"]);

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
          parent: m?.parentElement?.tagName,
          slot: !!document.querySelector("[data-cm-slot]"),
          focused: document.activeElement?.classList.contains("cm-enlarge"),
          enlargeShown: !!b && getComputedStyle(b).display !== "none",
        };
      });

      expect(after).toEqual({
        parent: "MAIN",
        slot: false,
        focused: true,
        enlargeShown: true,
      });

      const back = await box(p, "[data-camera-monitor]");
      expect(back.right - back.left).toBeLessThanOrEqual(640);
    });
  }
});
