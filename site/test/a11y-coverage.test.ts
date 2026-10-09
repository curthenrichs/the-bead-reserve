/* The accessibility statement says axe runs against every page. Every
   route in the built dist must therefore appear in a11y.test.ts PAGES.
   The 404 is covered there through an unknown path (/nope/). Read as
   text: importing the browser suite would run it. */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

const DIST = resolve(__dirname, "../dist");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.endsWith(".html") ? [full] : [];
  });
}

const routes = htmlFiles(DIST)
  .map((f) => relative(DIST, f).split(sep).join("/"))
  .filter((f) => f !== "404.html")
  .map((f) => `/${f.replace(/(^|\/)index\.html$/, "$1")}`);

const block = /const PAGES = \[([\s\S]*?)\];/.exec(
  readFileSync(resolve(__dirname, "a11y.test.ts"), "utf8"),
)?.[1];

const pages = [...(block ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

describe("axe coverage", () => {
  it("finds the built routes and the PAGES list", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(pages.length).toBeGreaterThan(0);
  });

  it("lists every built page in a11y.test.ts PAGES", () => {
    expect(routes.filter((r) => !pages.includes(r))).toEqual([]);
  });
});
