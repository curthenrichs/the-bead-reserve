// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CRO_MOOD } from "../src/scripts/camera-state";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const read = (src: string) =>
  fs.readFileSync(publicDir + src.replace(/^\//, ""), "utf8");

describe("CRO mood mapping", () => {
  it("maps every monitor state to a mood", () => {
    expect(CRO_MOOD).toEqual({
      fresh: "/henry-cro-broadcasting.svg",
      stale: "/henry-cro-signal-lost.svg",
      dark: "/henry-cro-low-battery.svg",
    });
  });

  it.each(Object.values(CRO_MOOD))(
    "%s is the vendored illustration form",
    (src) => {
      const svg = read(src);
      expect(svg).toContain("#555555");
      expect(svg).not.toContain("#111111");
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      expect(vb).not.toBeNull();
      const [, w, h] = vb!;

      const full = (svg.match(/<rect\b[^>]*>/g) ?? []).find(
        (tag) => tag.includes(`width="${w}"`) && tag.includes(`height="${h}"`),
      );

      expect(full).toBeUndefined();
    },
  );
});
