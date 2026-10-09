import { describe, it, expect } from "vitest";
import { page } from "./dist";

describe.each([
  ["/privacy/", "The Bead Reserve : Privacy"],
  ["/accessibility/", "The Bead Reserve : Accessibility"],
  ["/terms/", "The Bead Reserve : Terms"],
])("%s", (path, title) => {
  const doc = page(path);

  it("is titled and has one h1 inside main", () => {
    expect(doc.title).toBe(title);
    expect(doc.querySelectorAll("main h1")).toHaveLength(1);
  });
});

/* The privacy policy written as released (Curt 2026-10-08): analytics
   on, wallets and redemption shipping covered. */
describe("/privacy/ as released", () => {
  const doc = page("/privacy/");

  const squash = (s: string | null | undefined) =>
    s?.replace(/\s+/g, " ").trim();

  const paras = [...doc.querySelectorAll("main .prose p")].map((p) =>
    squash(p.textContent),
  );

  it("is dated October 8, 2026", () => {
    expect(paras).toContain("Last updated: October 8, 2026");
  });

  it("states the Cloudflare Web Analytics page count, linked", () => {
    expect(paras).toContain(
      "The site uses Cloudflare Web Analytics to count page views. Cloudflare adds a small script to each page for this. It sets no cookies, stores nothing in the browser, and does not follow a visitor to other sites. It produces a tally of which pages were read.",
    );

    const link = [...doc.querySelectorAll("main a")].find(
      (a) => squash(a.textContent) === "Cloudflare Web Analytics",
    );

    expect(link?.getAttribute("href")).toBe(
      "https://developers.cloudflare.com/web-analytics/",
    );
  });

  it("covers wallet connection, then redemption shipping right after", () => {
    const wallet = paras.indexOf(
      "Claiming and redeeming BEADZ connect a wallet to the site. The site reads the wallet's public address to show its holdings and to submit the transaction the holder approves. The site does not store the address. Transactions on Base are public and permanent. The Reserve can neither hide nor remove them.",
    );

    expect(wallet).toBeGreaterThan(-1);

    expect(paras[wallet + 1]).toBe(
      "A redemption is delivered by certified mail, which requires a name and a postal address. These are collected at redemption, used to address that shipment and nothing else, and deleted once delivery is confirmed.",
    );
  });

  it("retains redemption shipping details only until delivery", () => {
    const items = [...doc.querySelectorAll("main .prose li")].map((li) =>
      squash(li.textContent),
    );

    expect(items).toContain(
      "Redemption shipping details. Held until delivery is confirmed, then deleted.",
    );
  });

  it("names both records the site can hold", () => {
    expect(
      paras.some((p) =>
        p?.endsWith(
          "In nearly every case the site holds nothing. The records it can hold are a mailing list address and, while a redemption is in transit, a shipping address. The unsubscribe link in any dispatch removes the first.",
        ),
      ),
    ).toBe(true);
  });

  it("drops the pre-launch text", () => {
    const text = squash(doc.querySelector("main")?.textContent) ?? "";

    expect(text).not.toMatch(
      /runs no analytics|does not yet connect|only record it can hold/,
    );
  });
});

/* The accessibility statement follows the blog's, section by section
   (Curt 2026-10-08); only this site's facts differ. */
describe("/accessibility/ in the blog's language", () => {
  const doc = page("/accessibility/");

  const squash = (s: string | null | undefined) =>
    s?.replace(/\s+/g, " ").trim();

  const paras = [...doc.querySelectorAll("main .prose p")].map((p) =>
    squash(p.textContent),
  );

  it("opens as a statement from the LLC for this website", () => {
    expect(paras[0]).toBe(
      "This is an accessibility statement from Curt Henrichs LLC for The Bead Reserve website.",
    );
  });

  it("carries the blog's sections in order", () => {
    const heads = [...doc.querySelectorAll("main .prose h2")].map((h) =>
      squash(h.textContent),
    );

    expect(heads).toEqual([
      "Conformance status",
      "Feedback",
      "Technical specifications",
      "Limitations and alternatives",
      "Assessment approach",
      "Date",
    ]);
  });

  it("states partial conformance with WCAG 2.2 AA in the blog's words", () => {
    expect(paras).toContain(
      "The Web Content Accessibility Guidelines (WCAG) define requirements for designers and developers to improve accessibility for people with disabilities. They define three levels of conformance: Level A, Level AA, and Level AAA. The Bead Reserve is partially conformant with WCAG 2.2 Level AA. Partially conformant means that some parts of the content do not fully conform to the accessibility standard.",
    );
  });

  it("lists the contacts and the response line", () => {
    expect(paras).toContain(
      "If you encounter an accessibility barrier on this site, please let me know:",
    );

    expect(paras).toContain(
      "I try to respond to feedback as quickly as possible.",
    );

    expect(
      doc.querySelector('main a[href="mailto:curthenrichs@gmail.com"]'),
    ).not.toBeNull();
  });

  it("lists the technologies", () => {
    const items = [...doc.querySelectorAll("main .prose ul li")].map((li) =>
      squash(li.textContent),
    );

    expect(items).toEqual(
      expect.arrayContaining(["HTML", "CSS", "JavaScript"]),
    );
  });

  it("numbers the two known limitations", () => {
    expect(doc.querySelectorAll("main .prose ol li")).toHaveLength(2);

    expect(paras).toContain(
      "Please contact me if you observe an issue not listed above.",
    );
  });

  it("describes the assessment and dates the revision", () => {
    expect(
      paras.some((p) =>
        p?.startsWith(
          "Curt Henrichs assessed the accessibility of this site by self-evaluation.",
        ),
      ),
    ).toBe(true);

    expect(paras).toContain(
      "This statement was created on 7 October 2026 and revised on 8 October 2026.",
    );
  });
});

describe("policies in the footer", () => {
  it("every page's footer carries the Rules group, the policy pages themselves", () => {
    const hrefs = [...page("/").querySelectorAll("footer a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(hrefs).toEqual(
      expect.arrayContaining(["/privacy/", "/terms/", "/accessibility/"]),
    );

    expect(hrefs).not.toContain("/policies/");
  });

  it("the 404 is noindex and in the system chrome", () => {
    const doc = page("/404.html");

    expect(
      doc.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex");

    expect(doc.querySelector("header#masthead")).not.toBeNull();
  });
});
