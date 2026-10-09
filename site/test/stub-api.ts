/* The preview server has no Worker behind /api, so the monitor reads
   dark there. The browser suites that need a live frame stub the two
   endpoints the island calls: a fresh reserve and a small PNG as the
   frame (the token art, any real image will do). Call before goto. */
import { createHash } from "node:crypto";
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

/* attested: the record carries the frame's real SHA-256 and a
   signature of zeros, which no device key verifies. The Fault Cam
   page's in-browser check then runs end to end and must answer
   "Signature invalid". */
const ATTESTED = {
  ...FRESH,
  counter: 8,
  ts: 1_790_000_000,
  sha256: createHash("sha256").update(FRAME).digest("hex"),
  sig: "00".repeat(64),
};

export async function stubLiveReserve(
  page: Page,
  { attested = false } = {},
): Promise<void> {
  await page.setRequestInterception(true);

  page.on("request", (req) => {
    const { pathname } = new URL(req.url());

    if (pathname === "/api/reserve") {
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(attested ? ATTESTED : FRESH),
      });
    } else if (pathname === "/api/frame/latest") {
      void req.respond({ status: 200, contentType: "image/png", body: FRAME });
    } else {
      void req.continue();
    }
  });
}
