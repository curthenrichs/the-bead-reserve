/* Dist tests read the built site, so the suite builds once up front.
   `astro build` alone, not `npm run build`: the whitepaper prebuild
   needs Typst, and no test reads the PDF. */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  execSync("npx astro build", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
  });
}
