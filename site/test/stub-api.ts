/* The preview server has no Worker behind /api, so the monitor reads
   dark there. The browser suites that need a live frame stub the two
   endpoints the island calls: a fresh reserve and a small PNG as the
   frame (the token art, any real image will do). Call before goto. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "puppeteer-core";

const FRAME = readFileSync(
  fileURLToPath(new URL("../public/beadz-token-256.png", import.meta.url)),
);

const FRESH = {
  frameUrl: "/api/frame/latest",
  counter: 7,
  ts: 1,
  sha256: null,
  sig: null,
  croText: "sealed tight",
  status: "fresh",
  apiVersion: 1,
};

export async function stubLiveReserve(page: Page): Promise<void> {
  await page.setRequestInterception(true);

  page.on("request", (req) => {
    const { pathname } = new URL(req.url());

    if (pathname === "/api/reserve") {
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FRESH),
      });
    } else if (pathname === "/api/frame/latest") {
      void req.respond({ status: 200, contentType: "image/png", body: FRAME });
    } else {
      void req.continue();
    }
  });
}
