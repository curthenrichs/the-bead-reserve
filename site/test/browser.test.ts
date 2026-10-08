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
} from "@half-built/tooling/test-kit/browser-server.ts";

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

  async function open(path = "/"): Promise<Page> {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    page = await desktopPage(browser);
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
    return page;
  }

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

  it("the seal sits above the scroll-to-top button without touching it", async () => {
    const p = await open();
    await scrollToEnd(p);
    await p.waitForSelector("a.scroll-top.show");

    const [seal, top] = await p.$$eval(".seal, a.scroll-top", (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    );

    expect(seal.bottom).toBeLessThanOrEqual(top.top);
  });

  it("scrolled to the end, the footer's last line clears the seal", async () => {
    const p = await open();
    await scrollToEnd(p);

    const { sealTop, lastBottom } = await p.evaluate(() => {
      const links = [...document.querySelectorAll("footer a")];
      const last = links[links.length - 1]?.getBoundingClientRect().bottom ?? 0;
      return {
        sealTop:
          document.querySelector(".seal")?.getBoundingClientRect().top ?? 0,
        lastBottom: last,
      };
    });

    expect(lastBottom).toBeLessThanOrEqual(sealTop);
  });
});
