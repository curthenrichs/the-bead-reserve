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

  it("the seal holds the lower left, clear of the scroll-to-top button", async () => {
    const p = await open();
    await scrollToEnd(p);
    await p.waitForSelector("a.scroll-top.show");
    const seal = await box(p, ".seal");
    const top = await box(p, "a.scroll-top");
    const width = await p.evaluate(() => window.innerWidth);

    expect(seal.right).toBeLessThanOrEqual(width / 2);
    expect(intersects(seal, top), JSON.stringify({ seal, top })).toBe(false);
  });

  it("scrolled to the end, the footer's last line clears the seal", async () => {
    const p = await open();
    await scrollToEnd(p);

    const { sealTop, lastBottom, linkCount } = await p.evaluate(() => {
      const links = [...document.querySelectorAll("footer a")];
      const last = links.at(-1)?.getBoundingClientRect().bottom;
      const seal = document.querySelector(".seal")?.getBoundingClientRect();
      return {
        sealTop: seal?.top ?? Number.NaN,
        lastBottom: last ?? Number.NaN,
        linkCount: links.length,
      };
    });

    expect(linkCount, "no footer links matched").toBeGreaterThan(0);
    expect(sealTop, "no .seal on the page").not.toBeNaN();
    expect(lastBottom).toBeLessThanOrEqual(sealTop);
  });

  /* WCAG 2.2 SC 2.4.11: focus-driven scrolling must not park a small
     focused link under the fixed seal. scroll-padding-bottom reserves
     the seal's dock. */
  it("a Tabbed-to note reference is not hidden under the seal", async () => {
    const p = await open();
    let found = false;

    for (let i = 0; i < 80 && !found; i++) {
      await p.keyboard.press("Tab");

      found = await p.evaluate(
        () =>
          !!document.activeElement?.closest(
            'section[aria-labelledby="redeem-heading"] sup.note-ref',
          ),
      );
    }

    expect(found, "Tab never reached the redemption note ref").toBe(true);

    /* The page scrolls smoothly; wait for the focus scroll to settle. */
    await p.evaluate(async () => {
      let last = -1;

      while (window.scrollY !== last) {
        last = window.scrollY;
        await new Promise((r) => setTimeout(r, 150));
      }
    });

    const ref = await box(p, ":focus");
    const seal = await box(p, ".seal");

    const inside =
      ref.left >= seal.left &&
      ref.right <= seal.right &&
      ref.top >= seal.top &&
      ref.bottom <= seal.bottom;

    expect(inside, JSON.stringify({ ref, seal })).toBe(false);
    expect(intersects(ref, seal), JSON.stringify({ ref, seal })).toBe(false);

    /* The mechanism itself: at 1280 the ref happens to sit just right of
       the seal, so the geometry alone would pass without the padding. */
    const padding = await p.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingBottom,
    );

    expect(padding).toBe("178px");
  });

  it("the monitor is at most 480px wide and centered in main", async () => {
    const p = await open();
    const m = await box(p, "[data-camera-monitor]");
    const main = await box(p, "main");

    expect(m.right - m.left).toBeLessThanOrEqual(480);

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
