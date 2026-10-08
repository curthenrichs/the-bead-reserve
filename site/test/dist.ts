import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

/* A built page as a Document. "/" and "/brand/" map to their
   index.html; a path ending in .html is read as is. */
export function page(path: string): Document {
  const rel = path.endsWith(".html") ? path : `${path.replace(/\/?$/, "/")}index.html`;
  const html = readFileSync(resolve(__dirname, `../dist${rel}`), "utf8");
  return new JSDOM(html).window.document;
}
