import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const wpDir = resolve(here, "../../whitepaper");
const pdfSrc = resolve(wpDir, "out/beadz-whitepaper.pdf");
const pdfDst = resolve(here, "../public/whitepaper.pdf");

try {
  if (platform === "win32") {
    execFileSync("pwsh", ["-File", resolve(wpDir, "build.ps1")], { stdio: "inherit" });
  } else {
    execFileSync("bash", [resolve(wpDir, "build.sh")], { stdio: "inherit" });
  }
} catch (e) {
  console.error("whitepaper build failed:", e.message);
  process.exit(1);
}

if (!existsSync(pdfSrc)) {
  console.error(`whitepaper PDF not found at ${pdfSrc} after build — refusing to ship a dead /whitepaper.pdf link.`);
  process.exit(1);
}
mkdirSync(dirname(pdfDst), { recursive: true });
copyFileSync(pdfSrc, pdfDst);
console.log(`whitepaper.pdf copied to ${pdfDst}`);
