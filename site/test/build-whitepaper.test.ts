import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(__dirname, "../scripts/build-whitepaper.mjs");

describe("whitepaper prebuild", () => {
  it("exits non-zero with a clear message when the PDF can't be produced", () => {
    let failed = false;
    let output = "";
    try {
      // Empty PATH -> neither typst nor the shell's build succeeds -> script must fail.
      // Spawn via process.execPath (absolute path) rather than the bare "node" command:
      // on Windows, CreateProcess cannot resolve a bare command name when PATH is empty,
      // which would fail the outer spawn itself (ENOENT) before the script ever runs.
      // The child process still inherits PATH="", so the script's internal pwsh/bash
      // calls fail to resolve as intended.
      execFileSync(process.execPath, [script], { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    } catch (e: any) {
      failed = true;
      output = `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`;
    }
    expect(failed).toBe(true);
    expect(output.toLowerCase()).toMatch(/whitepaper|typst|not found|failed/);
  });
});
