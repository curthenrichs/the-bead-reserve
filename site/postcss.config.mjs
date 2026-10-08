/* The @half-built/css breakpoints are @custom-media; postcss-global-data
   feeds their definitions into every stylesheet so a component style can
   use --bp-phone without importing anything (consumer recipe in the
   @half-built/css README). */
import postcssGlobalData from "@csstools/postcss-global-data";
import postcssCustomMedia from "postcss-custom-media";
import { fileURLToPath } from "node:url";

const breakpoints = fileURLToPath(
  import.meta.resolve("@half-built/css/tokens/breakpoints.css"),
);

export default {
  plugins: [postcssGlobalData({ files: [breakpoints] }), postcssCustomMedia()],
};
