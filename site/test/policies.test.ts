import { describe, it, expect } from "vitest";
import { page } from "./dist";

describe.each([
  ["/privacy/", "The Bead Reserve : Privacy"],
  ["/accessibility/", "The Bead Reserve : Accessibility"],
  ["/terms/", "The Bead Reserve : Terms"],
  ["/policies/", "The Bead Reserve : Policies"],
])("%s", (path, title) => {
  const doc = page(path);

  it("is titled and has one h1 inside main", () => {
    expect(doc.title).toBe(title);
    expect(doc.querySelectorAll("main h1")).toHaveLength(1);
  });
});

describe("policies hub and footer", () => {
  it("the hub links all three", () => {
    const hrefs = [...page("/policies/").querySelectorAll("main a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(hrefs).toEqual(
      expect.arrayContaining(["/privacy/", "/accessibility/", "/terms/"]),
    );
  });

  it("every page's footer carries the Rules group", () => {
    const hrefs = [...page("/").querySelectorAll("footer a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/policies/",
        "/privacy/",
        "/terms/",
        "/accessibility/",
      ]),
    );
  });

  it("the 404 is noindex and in the system chrome", () => {
    const doc = page("/404.html");

    expect(
      doc.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex");

    expect(doc.querySelector("header#masthead")).not.toBeNull();
  });
});
