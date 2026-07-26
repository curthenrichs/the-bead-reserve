import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  isValidAddress,
  buildTokenList,
  serializeTokenList,
  parseBeadzAddress,
  ZERO_ADDRESS,
  CHAIN_ID,
  DECIMALS,
  SYMBOL,
  LOGO_URI,
} from "../scripts/tokenlist.mjs";
import { run } from "../scripts/build-tokenlist.mjs";

// Importing build-tokenlist.mjs must not touch the real site/public/ -- see
// the isMain guard at the bottom of that file. This test only imports `run`
// and always points it at a temp directory.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.join(HERE, "..");
const REAL_CONFIG_PATH = path.join(SITE_ROOT, "src", "config.ts");
const REAL_PUBLIC_TOKENLIST = path.join(SITE_ROOT, "public", "tokenlist.json");
const CLI_PATH = path.join(SITE_ROOT, "scripts", "build-tokenlist.mjs");

const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";
const MALFORMED_ADDRESS = "0x123"; // right prefix, truncated
const PLACEHOLDER_ADDRESS = "YOUR_CONTRACT_ADDRESS_HERE"; // not address-shaped at all

const tmpDirs = [];
function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beadz-tokenlist-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

describe("isValidAddress", () => {
  it("accepts a well-formed, non-zero EVM address", () => {
    expect(isValidAddress(VALID_ADDRESS)).toBe(true);
  });

  it.each([
    ["a truncated address", MALFORMED_ADDRESS],
    ["a placeholder string", PLACEHOLDER_ADDRESS],
    ["the zero address", ZERO_ADDRESS],
    ["the zero address, mixed case", "0x" + "0".repeat(39) + "0"],
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a too-long address", VALID_ADDRESS + "ab"],
    ["non-hex characters", "0x" + "g".repeat(40)],
  ])("rejects %s", (_label, value) => {
    expect(isValidAddress(value)).toBe(false);
  });
});

describe("buildTokenList: abort paths actually throw", () => {
  it("aborts on a malformed/truncated address", () => {
    expect(() => buildTokenList(MALFORMED_ADDRESS)).toThrow(/not a valid EVM address/);
  });

  it("aborts on a placeholder string", () => {
    expect(() => buildTokenList(PLACEHOLDER_ADDRESS)).toThrow(/not a valid EVM address/);
  });

  it("aborts on the zero address, with a message naming it explicitly", () => {
    expect(() => buildTokenList(ZERO_ADDRESS)).toThrow(/zero address/i);
  });

  it("aborts on null (the current, pre-launch config.ts value passed in directly)", () => {
    expect(() => buildTokenList(null)).toThrow();
  });
});

describe("buildTokenList: valid address produces a correct token list", () => {
  const list = buildTokenList(VALID_ADDRESS);

  it("carries the required top-level schema fields", () => {
    expect(list.name).toBeTruthy();
    expect(typeof list.timestamp).toBe("string");
    expect(list.version).toMatchObject({ major: expect.any(Number), minor: expect.any(Number), patch: expect.any(Number) });
    expect(Array.isArray(list.tokens)).toBe(true);
    expect(list.tokens).toHaveLength(1);
  });

  it("carries the correct chainId, address, symbol, decimals, and logoURI", () => {
    const token = list.tokens[0];
    expect(token.chainId).toBe(8453);
    expect(token.chainId).toBe(CHAIN_ID);
    expect(token.address).toBe(VALID_ADDRESS);
    expect(token.symbol).toBe("BEADZ");
    expect(token.symbol).toBe(SYMBOL);
    expect(token.decimals).toBe(18);
    expect(token.decimals).toBe(DECIMALS);
    expect(token.logoURI).toBe("https://beadz.half-built-robots.com/beadz-token-256.png");
    expect(token.logoURI).toBe(LOGO_URI);
  });
});

describe("serializeTokenList determinism", () => {
  it("produces byte-identical output across two calls, even if the clock moves", () => {
    const before = Date.now;
    try {
      Date.now = () => 1;
      const first = serializeTokenList(buildTokenList(VALID_ADDRESS));
      Date.now = () => 999999999999;
      const second = serializeTokenList(buildTokenList(VALID_ADDRESS));
      expect(first).toBe(second);
    } finally {
      Date.now = before;
    }
  });

  it("is valid, trailing-newline-terminated JSON", () => {
    const text = serializeTokenList(buildTokenList(VALID_ADDRESS));
    expect(text.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

describe("parseBeadzAddress: reads src/config.ts's BEADZ_ADDRESS declaration as text", () => {
  it("returns null for the literal `null`", () => {
    const source = 'export const BEADZ_ADDRESS: string | null = null;';
    expect(parseBeadzAddress(source)).toBeNull();
  });

  it("returns the string contents for a double-quoted literal", () => {
    const source = `export const BEADZ_ADDRESS: string | null = "${VALID_ADDRESS}";`;
    expect(parseBeadzAddress(source)).toBe(VALID_ADDRESS);
  });

  it("returns the string contents for a single-quoted literal", () => {
    const source = `export const BEADZ_ADDRESS: string | null = '${VALID_ADDRESS}';`;
    expect(parseBeadzAddress(source)).toBe(VALID_ADDRESS);
  });

  it("throws when the declaration can't be found (config.ts shape drifted)", () => {
    expect(() => parseBeadzAddress("export const SOMETHING_ELSE = 1;")).toThrow(/BEADZ_ADDRESS/);
  });

  it("agrees with the real, current src/config.ts: still null pre-launch", () => {
    const realSource = fs.readFileSync(REAL_CONFIG_PATH, "utf8");
    expect(parseBeadzAddress(realSource)).toBeNull();
  });
});

describe("run(): orchestration writes only on a valid address, never on invalid input", () => {
  it("with address null: emits nothing and reports success (not an error)", () => {
    const outDir = makeTmpDir();
    const result = run({ address: null, outDir });
    expect(result.emitted).toBe(false);
    expect(result.message.toLowerCase()).toContain("null");
    expect(fs.existsSync(path.join(outDir, "tokenlist.json"))).toBe(false);
  });

  it.each([
    ["a malformed address", MALFORMED_ADDRESS],
    ["a placeholder", PLACEHOLDER_ADDRESS],
    ["the zero address", ZERO_ADDRESS],
  ])("with %s: throws and writes no file, not even the directory", (_label, badAddress) => {
    const outDir = path.join(makeTmpDir(), "nested", "public");
    expect(fs.existsSync(outDir)).toBe(false);
    expect(() => run({ address: badAddress, outDir })).toThrow();
    expect(fs.existsSync(outDir)).toBe(false);
    expect(fs.existsSync(path.join(outDir, "tokenlist.json"))).toBe(false);
  });

  it("with a valid address: writes tokenlist.json with the correct fields", () => {
    const outDir = makeTmpDir();
    const result = run({ address: VALID_ADDRESS, outDir });
    expect(result.emitted).toBe(true);
    const outPath = path.join(outDir, "tokenlist.json");
    expect(fs.existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    expect(parsed.tokens[0]).toMatchObject({
      chainId: 8453,
      address: VALID_ADDRESS,
      symbol: "BEADZ",
      decimals: 18,
      logoURI: "https://beadz.half-built-robots.com/beadz-token-256.png",
    });
  });

  it("emission is deterministic: running twice produces byte-identical files", () => {
    const outDirA = makeTmpDir();
    const outDirB = makeTmpDir();
    run({ address: VALID_ADDRESS, outDir: outDirA });
    run({ address: VALID_ADDRESS, outDir: outDirB });
    const bytesA = fs.readFileSync(path.join(outDirA, "tokenlist.json"));
    const bytesB = fs.readFileSync(path.join(outDirB, "tokenlist.json"));
    expect(bytesA.equals(bytesB)).toBe(true);
  });
});

describe("CLI end-to-end, against the real (pre-launch) src/config.ts", () => {
  it("exits 0, prints the null explanation, and leaves site/public/tokenlist.json unwritten", () => {
    // Guard the precondition this test relies on: if config.ts has already
    // been set to a real address, this assertion (not a crash) is the
    // signal to update this test alongside removing the null-gate.
    const realSource = fs.readFileSync(REAL_CONFIG_PATH, "utf8");
    expect(parseBeadzAddress(realSource)).toBeNull();

    const before = fs.existsSync(REAL_PUBLIC_TOKENLIST);

    let stdout = "";
    let threw = false;
    try {
      stdout = execFileSync(process.execPath, [CLI_PATH], { cwd: SITE_ROOT, encoding: "utf8" });
    } catch (e) {
      threw = true;
      stdout = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }

    expect(threw).toBe(false); // real CLI process exited 0
    expect(stdout.toLowerCase()).toContain("null");
    expect(fs.existsSync(REAL_PUBLIC_TOKENLIST)).toBe(before); // still absent, run created nothing
    expect(fs.existsSync(REAL_PUBLIC_TOKENLIST)).toBe(false);
  });
});
