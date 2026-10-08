/* Shared between the layout's frontmatter and its client script, so
   neither duplicates the strings. */
export const THEME_STORAGE_KEY = "beadz-theme";

/* Matches this site's key in the shared ecosystem document. */
export const ECOSYSTEM_SELF_KEY = "beadz";

/* Null is the kill switch: the island never mounts and the baseline in
   data/site.ts ships as is. */
export const ECOSYSTEM_ENDPOINT: string | null =
  "https://ecosystem.half-built-robots.com/ecosystem.json";
