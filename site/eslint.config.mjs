import preset from "@half-built/tooling/eslint";

export default [
  ...preset,
  {
    ignores: ["dist/", "node_modules/", ".astro/", "public/", "brand/vendor/"],
  },
];
