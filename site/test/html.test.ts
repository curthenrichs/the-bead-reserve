import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlValidate, type ConfigData } from "html-validate";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const PRESET = JSON.parse(readFileSync(new URL("../htmlvalidate.json", import.meta.url), "utf-8")) as ConfigData;

describe("built html", () => {
  it("every built page passes the html-validate preset", async () => {
    const files = readdirSync(DIST, { recursive: true }).map(String).filter((f) => f.endsWith(".html")).map((f) => join(DIST, f));
    expect(files.length).toBeGreaterThan(1);
    const hv = new HtmlValidate(PRESET);
    const failures: string[] = [];

    for (const file of files) {
      const report = await hv.validateFile(file);
      for (const m of report.results.flatMap((r) => r.messages)) {
        failures.push(`${file}:${String(m.line)}:${String(m.column)} ${m.ruleId} ${m.message}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
