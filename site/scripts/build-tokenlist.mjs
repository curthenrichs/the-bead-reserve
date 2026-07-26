/**
 * Emits site/public/tokenlist.json -- but only once BEADZ_ADDRESS in
 * src/config.ts is set to a real, deployed contract address. Until then
 * this prints why it's skipping and exits 0: no BEADZ contract exists on
 * any chain yet (see the public README's "Canonicity" section), so there is
 * nothing to describe yet. That's expected, not an error.
 *
 * A token list is the one distribution channel fully under this project's
 * own control, so it is exactly the wrong place to ever guess or
 * placeholder an address -- wallets cache token lists, and a wrong address
 * in circulation is the "counterfeit BEADZ" scenario the README warns
 * about. Address validation happens before any write; see tokenlist.mjs.
 *
 * Run: npm run tokenlist:build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildTokenList, serializeTokenList, parseBeadzAddress } from "./tokenlist.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(HERE, "..", "src", "config.ts");
const OUT_DIR = path.join(HERE, "..", "public");

/**
 * Orchestration: given an already-resolved address (null, or a raw string
 * straight from config.ts, unvalidated) and an output directory, either
 * writes tokenlist.json or reports there's nothing to do. buildTokenList
 * validates before any filesystem write, so an invalid address never
 * touches outDir -- not even mkdir. Exported separately from main() so
 * tests can point outDir at a temp directory instead of the real
 * site/public/, and can exercise every address case without editing
 * config.ts.
 */
export function run({ address, outDir }) {
  if (address === null) {
    return {
      emitted: false,
      message:
        "BEADZ_ADDRESS is null (no contract deployed yet) -- not emitting tokenlist.json. This is expected, not an error.",
    };
  }
  const list = buildTokenList(address); // throws a descriptive Error for any invalid address
  const outPath = path.join(outDir, "tokenlist.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, serializeTokenList(list));
  return { emitted: true, path: outPath, message: `tokenlist.json written to ${outPath}` };
}

function main() {
  const configSource = fs.readFileSync(CONFIG_PATH, "utf8");
  const address = parseBeadzAddress(configSource);
  const result = run({ address, outDir: OUT_DIR });
  console.log(result.message);
}

// Only run when this file is executed directly (`node scripts/build-tokenlist.mjs`
// / `npm run tokenlist:build`), not when it's imported -- tokenlist.test.mjs
// imports `run` to point it at a temp directory, and must not trigger a real
// write to site/public/ as a side effect of that import.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`tokenlist build aborted: ${err.message}`);
    process.exit(1);
  }
}
