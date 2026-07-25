import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG_OUTPUTS } from "./build.mjs";

// Importing build.mjs must not trigger a full rasterization pass — see the
// isMain guard at the bottom of build.mjs. This test only reads PNG_OUTPUTS.

const HERE = path.dirname(fileURLToPath(import.meta.url));
// site/brand/build.test.mjs -> site/brand -> site -> submodule root
const gitignorePath = path.join(HERE, "..", "..", ".gitignore");
const gitignore = fs.readFileSync(gitignorePath, "utf8");

describe(".gitignore exception list mirrors brand/build.mjs PNG_OUTPUTS", () => {
  it.each(PNG_OUTPUTS.map((o) => o.file))(
    "%s has a matching !/site/public/<name> exception line in .gitignore",
    (file) => {
      expect(gitignore).toContain(`!/site/public/${file}`);
    },
  );

  it("also covers og-image.png, which build.mjs writes outside PNG_OUTPUTS", () => {
    expect(gitignore).toContain("!/site/public/og-image.png");
  });
});
