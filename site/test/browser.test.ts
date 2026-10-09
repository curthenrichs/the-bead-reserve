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

  /* The live frame needs the Worker; stub-api.ts stands in for it. */
  for (const phone of [false, true]) {
    it(`the live frame opens full size in the lightbox and Escape closes it${phone ? " (phone)" : ""}`, async () => {
      const p = await open("/", { phone, live: true });
      const link = await p.waitForSelector("[data-cm-screen] a.lightbox-link");
      await link?.scrollIntoView();
      await link?.click();
      await p.waitForSelector("dialog.lb-dialog[open]");

      await p.waitForFunction(() => {
        const img = document.querySelector<HTMLImageElement>(
          "dialog.lb-dialog[open] .lb-img",
        );

        return (
          !!img &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.getAttribute("src") === "/api/frame/latest"
        );
      });

      const shown = await p.$eval("dialog.lb-dialog .lb-img", (img) => {
        const r = img.getBoundingClientRect();
        return { w: r.width, h: r.height, alt: img.getAttribute("alt") };
      });

      expect(shown.w).toBeGreaterThan(0);
      expect(shown.h).toBeGreaterThan(0);
      expect(shown.alt).toBe("Camera view of the reserve jar");

      await p.keyboard.press("Escape");
      await p.waitForSelector("dialog.lb-dialog[open]", { hidden: true });
    });
  }
});
