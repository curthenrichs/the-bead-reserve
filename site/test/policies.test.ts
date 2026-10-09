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
      "This site uses Cloudflare Web Analytics to count page views. Cloudflare adds a small script to each page for this. It sets no cookies, stores nothing in your browser, and does not follow you to other sites. It produces a tally of which pages were read.",
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
      "Claiming and redeeming BEADZ connect a wallet to the site. The site reads your wallet's public address to show its holdings and to submit the transaction you approve. I do not store the address. Transactions on Base are public and permanent. I can neither hide nor remove them.",
    );

    expect(wallet).toBeGreaterThan(-1);

    expect(paras[wallet + 1]).toBe(
      "A redemption is delivered by certified mail, which requires a name and a postal address. I collect these at redemption, use them to address that shipment and nothing else, and delete them once delivery is confirmed.",
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
          "In nearly every case the site holds nothing. The records it can hold are a mailing list address and, while a redemption is in transit, a shipping address. The unsubscribe link in any email removes the first.",
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

  /* The blog's first-person voice and section names (Curt 2026-10-08). */
  it("uses the blog's section names", () => {
    const heads = [...doc.querySelectorAll("main .prose h2")].map((h) =>
      squash(h.textContent),
    );

    expect(heads).toEqual([
      "What this site collects",
      "Cookies and browser storage",
      "Do Not Track",
      "Mailing list",
      "Why it's kept and for how long",
      "Where it's processed",
      "Links to other sites",
      "Children",
      "Your data",
      "Changes",
      "Contact",
    ]);
  });

  it("anchors the cookies section for the terms to link", () => {
    expect(
      squash(doc.querySelector("#cookies-and-browser-storage")?.textContent),
    ).toBe("Cookies and browser storage");
  });

  it("names the Cloudflare cookie and both local-storage keys", () => {
    const codes = [...doc.querySelectorAll("main .prose code")].map((c) =>
      squash(c.textContent),
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "cf_clearance",
        "beadz-theme",
        "half-built-ecosystem",
        "/api/",
      ]),
    );
  });

  it("drops the third-person costume wording", () => {
    const text = squash(doc.querySelector("main")?.textContent) ?? "";

    expect(text).not.toMatch(/Correspondence|dispatch|The Reserve can/);
  });
});

/* The terms in the blog's voice, with its gaps filled for a token
   site (Curt 2026-10-08). */
describe("/terms/ as released", () => {
  const doc = page("/terms/");

  const squash = (s: string | null | undefined) =>
    s?.replace(/\s+/g, " ").trim();

  const paras = [...doc.querySelectorAll("main .prose p")].map((p) =>
    squash(p.textContent),
  );

  const heads = [...doc.querySelectorAll("main .prose h2")].map((h) =>
    squash(h.textContent),
  );

  it("is dated October 8, 2026 and opens like the blog's", () => {
    expect(paras[0]).toBe("Last updated: October 8, 2026");

    expect(paras[1]).toBe(
      "The Bead Reserve (beadz.half-built-robots.com) is owned and operated by Curt Henrichs LLC, a California LLC. By using the site you agree to these terms.",
    );
  });

  it("carries every section in order", () => {
    expect(heads).toEqual([
      "Using the site",
      "The token",
      "On-chain transactions",
      "Code",
      "Brand assets",
      "No warranty",
      "Indemnity",
      "Cookies and browser storage",
      "Links to other sites",
      "Copyright complaints",
      "Changes",
      "Governing law",
      "Contact",
    ]);
  });

  it("reserves the site's words and the whitepaper text, quoting allowed", () => {
    const using = paras.find((p) =>
      p?.startsWith("You may read, link to, and share"),
    );

    expect(using).toContain(
      "The site's words, the whitepaper's text, the artwork (including Henry, the robot mascot, and the reserve seal), and the site design are copyright Curt Henrichs LLC, all rights reserved.",
    );

    expect(using).toContain(
      "Quoting a short passage with attribution and a link back is fine.",
    );

    expect(paras).toContain(
      "Search engines and AI crawlers are welcome to index the site, and AI developers are welcome to train on it.",
    );
  });

  it("keeps the code MIT and points the words back to Using the site", () => {
    expect(
      doc.querySelector('main a[href$="/blob/main/LICENSE"]')?.textContent,
    ).toBe("MIT license");

    expect(paras).toContain(
      "The site's words and the whitepaper's text are not covered by that grant. They are reserved under Using the site above.",
    );

    expect(doc.querySelector('main a[href="#using-the-site"]')).not.toBeNull();
    expect(doc.querySelector("#using-the-site")).not.toBeNull();
  });

  it("states that on-chain transactions are final and fees are the holder's", () => {
    expect(paras).toContain(
      "Claims and redemptions are transactions on Base that you sign with your own wallet. Transactions on Base are public and permanent. Once one is confirmed, it cannot be reversed. I cannot recover a lost key or undo a transaction, and I cannot return tokens sent to the wrong address.",
    );

    expect(paras).toContain(
      "You pay the network fee for each transaction, in ETH. A redemption burns your tokens at the moment of the transaction.",
    );
  });

  it("points cookies and browser storage at the privacy policy's section", () => {
    expect(
      doc.querySelector('main a[href="/privacy/#cookies-and-browser-storage"]'),
    ).not.toBeNull();
  });

  it("carries the blog's copyright complaints line", () => {
    expect(paras).toContain(
      "If you believe content on this site infringes your copyright, contact me using the information below and I will review and address it.",
    );
  });

  it("keeps the reserve uninsured and the law Californian, conflicts aside", () => {
    expect(paras.some((p) => p?.includes("The reserve is uninsured."))).toBe(
      true,
    );

    expect(paras).toContain(
      "These terms are governed by the laws of the State of California, United States, without regard to its conflict of law provisions.",
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
