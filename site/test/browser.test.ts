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
    { phone = false, live = false, attested = false, width = 390 } = {},
  ): Promise<Page> {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    page = phone ? await phonePage(browser, width) : await desktopPage(browser);
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

  /* The padding box, which an absolute child is placed against: the
     plate's .bracket-frame has top and bottom rules. */
  const paddingBox = (p: Page, sel: string): Promise<Box> =>
    p.$eval(sel, (e) => {
      const r = e.getBoundingClientRect();
      const top = r.top + e.clientTop;
      const left = r.left + e.clientLeft;
      return {
        top,
        left,
        bottom: top + e.clientHeight,
        right: left + e.clientWidth,
      };
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

  const SEAL_START = 30;
  const SEAL_INSET = 30;

  it("wide screens: the seal travels from the top-left corner to the bottom as the page scrolls", async () => {
    const p = await sized(1920, 1080);
    const vh = 1080;

    await scrollToFraction(p, 0);
    const top = await box(p, ".seal");
    const header = await box(p, "header#masthead .site-header-wrapper");

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

  /* The cap and the centering hold for the framed box as a whole. */
  it("the framed monitor is at most 640px wide and centered in main", async () => {
    const p = await open();
    const m = await box(p, ".plate-frame:has([data-camera-monitor])");
    const main = await box(p, "main");

    expect(m.right - m.left).toBeLessThanOrEqual(640);

    expect(
      Math.abs(m.left - main.left - (main.right - m.right)),
      JSON.stringify({ m, main }),
    ).toBeLessThanOrEqual(1);
  });

  /* The monitor sits in the package plate frame (0.15.0), the plate
     modal's frame inline: the four accent corner strokes on the frame,
     the plate inside it, and the Enlarge box on the plate's top-right
     corner where the modal's close box sits. */
  for (const phone of [false, true]) {
    it(`the Enlarge box sits on the frame's top-right corner${phone ? " (phone)" : ""}`, async () => {
      const p = await open("/", { phone });
      const frame = await box(p, ".plate-frame:has([data-camera-monitor])");

      const plate = await paddingBox(
        p,
        ".plate-frame-plate:has([data-camera-monitor])",
      );

      const btn = await box(p, ".plate-frame .cm-enlarge");
      const cx = (btn.left + btn.right) / 2;
      const cy = (btn.top + btn.bottom) / 2;

      /* Inside the frame's top-right region either way. */
      expect(btn.right).toBeLessThanOrEqual(frame.right);
      expect(btn.top).toBeGreaterThanOrEqual(frame.top);
      expect(frame.right - cx).toBeLessThan(60);
      expect(cy - frame.top).toBeLessThan(40);

      if (phone) {
        expect(Math.abs(plate.right - btn.right - 16)).toBeLessThanOrEqual(1);
      } else {
        /* Straddling the plate's corner, centered on it within a few px. */
        expect(Math.abs(cx - plate.right)).toBeLessThanOrEqual(3);
        expect(Math.abs(cy - plate.top)).toBeLessThanOrEqual(3);
      }

      expect(Math.abs(btn.top - plate.top + 17)).toBeLessThanOrEqual(1);

      const strokes = await p.$eval(
        ".plate-frame:has([data-camera-monitor])",
        (f) =>
          getComputedStyle(f).backgroundImage.split("linear-gradient").length -
          1,
      );

      expect(strokes).toBe(phone ? 0 : 8);
    });
  }

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
      const FRAME = ".plate-frame:has([data-camera-monitor])";

      const home = await p.$eval(
        FRAME,
        (m) =>
          m.parentElement?.getAttribute("aria-labelledby") ??
          m.parentElement?.tagName,
      );

      if (live) await p.waitForSelector("[data-cm-screen] img.cm-frame");
      const before = await box(p, "[data-camera-monitor]");
      const plate = await paddingBox(p, `${FRAME} > .plate-frame-plate`);
      const btn = await p.waitForSelector(`${FRAME} .cm-enlarge`);

      expect(
        await p.$eval(".cm-enlarge", (b) => [
          b.getAttribute("type"),
          b.getAttribute("aria-haspopup"),
          b.textContent.trim(),
        ]),
      ).toEqual(["button", "dialog", "Enlarge the reserve monitor"]);

      /* An icon box at the frame's plate's top-right corner: straddling
         it on desktop, the way the modal's close box straddles its
         plate, and tucked inside the corner on phones. */
      const corner = await box(p, `${FRAME} .cm-enlarge`);

      expect(corner.bottom - corner.top).toBeCloseTo(30, 0);

      if (phone) {
        expect(corner.right).toBeLessThanOrEqual(plate.right);
        expect(plate.right - corner.right).toBeLessThanOrEqual(20);
      } else {
        expect(Math.abs(corner.right - plate.right - 17)).toBeLessThanOrEqual(
          1,
        );
      }

      expect(Math.abs(corner.top - plate.top + 17)).toBeLessThanOrEqual(1);

      /* The corner box stays clear of the monitor itself. */
      expect(intersects(before, corner)).toBe(false);

      /* The bar's badge, and whatever sits above the monitor, stay
         clear of the corner box. */
      const badge = await box(p, "[data-cm-badge]");
      expect(intersects(badge, corner)).toBe(false);

      const above = await p.$eval(FRAME, (m) => {
        const r = m.previousElementSibling?.getBoundingClientRect();
        return r ? r.bottom : -Infinity;
      });

      expect(corner.top).toBeGreaterThan(above);

      await btn?.scrollIntoView();
      await btn?.click();
      await p.waitForSelector("dialog[open] [data-camera-monitor]");

      /* The inline corner box sits exactly where the modal's close does. */
      const pmPlate = await paddingBox(p, "dialog[open] .pm-plate");
      const pmClose = await box(p, "dialog[open] .pm-close");

      expect(
        Math.abs(pmClose.top - pmPlate.top - (corner.top - plate.top)),
      ).toBeLessThanOrEqual(1);

      expect(
        Math.abs(pmClose.right - pmPlate.right - (corner.right - plate.right)),
      ).toBeLessThanOrEqual(1);

      const inPlate = await p.evaluate(() => {
        const dlg = document.querySelector("dialog[open]");
        const m = document.querySelector("[data-camera-monitor]");
        const plate = m?.closest(".pm-plate");
        const btn = document.querySelector<HTMLElement>("main .cm-enlarge");
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
          placeholderInMain: !!document.querySelector(
            "main .plate-frame-plate > [data-cm-slot]",
          ),
          secondFrame: !!m?.closest(".plate-frame"),
          vw: document.documentElement.clientWidth,
        };
      });

      expect(inPlate.label).toBe("Reserve monitor");
      expect(inPlate.inPlate).toBe(true);
      expect(inPlate.bar && inPlate.caption).toBe(true);
      expect(inPlate.enlargeShown).toBe(false);
      expect(inPlate.placeholderInMain).toBe(true);
      expect(inPlate.secondFrame).toBe(false);
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
        const f = m?.closest(".plate-frame");
        const b = f?.querySelector(".cm-enlarge");
        return {
          parent:
            f?.parentElement?.getAttribute("aria-labelledby") ??
            f?.parentElement?.tagName,
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

  /* The dead signal (owner call 2026-10-08): analog static on the dark
     screen, its grain on ::before and a rolling scanline on ::after,
     both frozen under reduced motion with the grain still shown, and
     gone once a frame shows. The placeholder sits on a solid band above
     them. */
  const staticLayer = (p: Page, sel = "[data-cm-screen]") =>
    p.$eval(sel, (s) => {
      const layer = (pseudo: string) => {
        const cs = getComputedStyle(s, pseudo);
        return {
          content: cs.content,
          image: `${cs.backgroundImage} ${cs.maskImage}`,
          animation: cs.animationName,
          playing: cs.animationPlayState,
        };
      };

      const ph = s.querySelector("[data-cm-placeholder]");

      return {
        grain: layer("::before"),
        scan: layer("::after"),
        band: ph ? getComputedStyle(ph).backgroundColor : null,
        monitor: getComputedStyle(s.closest("[data-camera-monitor]") ?? s)
          .backgroundColor,
      };
    });

  const present = (l: { content: string; image: string }) =>
    l.content !== "none" && l.content !== "normal" && l.image.includes("url(");

  for (const path of ["/", "/fault-cam/"]) {
    it(`${path}: the dark monitor shows animated static and a rolling scanline`, async () => {
      const p = await open(path);

      expect(
        await p.$eval("[data-camera-monitor]", (m) =>
          m.getAttribute("data-status"),
        ),
      ).toBe("dark");

      const s = await staticLayer(p);
      expect(present(s.grain), JSON.stringify(s)).toBe(true);
      expect(s.grain.animation).not.toBe("none");
      expect(s.scan.content).not.toBe("none");
      expect(s.scan.image).toMatch(/gradient/);
      expect(s.scan.animation).not.toBe("none");

      /* The placeholder reads on the screen's own black. */
      expect(s.band).toBe(s.monitor);

      expect(
        await p.$eval("[data-cm-placeholder]", (e) => e.textContent.trim()),
      ).toBe("signal interrupted, reserve remains sealed");
    });
  }

  it("reduced motion: the static is frozen but still shown", async () => {
    if (!browser) throw new Error("no browser (beforeAll failed)");
    page = await desktopPage(browser);

    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);

    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle0" });
    const s = await staticLayer(page);
    expect(present(s.grain), JSON.stringify(s)).toBe(true);

    for (const l of [s.grain, s.scan]) {
      expect(l.animation === "none" || l.playing === "paused").toBe(true);
    }
  });

  it("a fresh frame: no static on the screen", async () => {
    const p = await open("/", { live: true });
    await p.waitForSelector("[data-cm-screen] img.cm-frame");
    const s = await staticLayer(p);
    expect(present(s.grain), JSON.stringify(s)).toBe(false);
    expect(s.scan.image).not.toMatch(/gradient/);
  });

  it("the popped-out dark monitor keeps its static", async () => {
    const p = await open();
    const btn = await p.waitForSelector(".cm-enlarge");
    await btn?.scrollIntoView();
    await btn?.click();
    await p.waitForSelector("dialog[open] [data-camera-monitor]");
    const s = await staticLayer(p, "dialog[open] [data-cm-screen]");
    expect(present(s.grain), JSON.stringify(s)).toBe(true);
    expect(s.grain.animation).not.toBe("none");
    expect(s.scan.animation).not.toBe("none");
  });

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
    const m = await box(p, ".plate-frame:has([data-camera-monitor])");
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

    /* The certificate's stamp: the short form, in the error ink. */
    expect(rec["verdict-tag"]).toBe("SIGNATURE INVALID");

    const ink = await p.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--error-ink)";
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      const stamp = document.querySelector('[data-at="verdict-tag"]');
      return { want, got: stamp ? getComputedStyle(stamp).color : "" };
    });

    expect(ink.got).toBe(ink.want);
  });

  it("/fault-cam/ at 375px: the certificate's hex wraps, no sideways scroll", async () => {
    const p = await open("/fault-cam/", {
      phone: true,
      attested: true,
      width: 375,
    });

    await p.waitForFunction(
      () => document.querySelector('[data-at="counter"]')?.textContent === "8",
    );

    expect(await sideways(p)).toBeLessThanOrEqual(0);

    const spill = await p.$eval("[data-attestation]", (card) => {
      const r = card.getBoundingClientRect();
      return [...card.querySelectorAll("td, th")].some(
        (c) => c.getBoundingClientRect().right > r.right + 0.5,
      );
    });

    expect(spill).toBe(false);
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
