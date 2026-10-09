/* The header's two icon glyphs, as inline SVG markup for the package
   SiteHeader's socials (built into SOCIALS in src/data/site.ts). Both
   are copied verbatim from the blog's registry,
   half-built-robots-blog/src/lib/social-icons.ts (keys github and
   portfolio). They live here, outside src, because the Henry glyph
   carries its gray and white as hex in SVG attributes and src/ admits
   no hex (test/no-hex.test.ts).

   The Henry glyph mirrors the blog's tracked exception to the
   vendoring rule (brand/README.md: Henry is vendored, never
   re-authored) until henry-mascot ships a line-glyph form. When it
   does, this copy is replaced by the vendored file. */
export const SOCIAL_ICONS = Object.freeze({
  github:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  henry:
    '<svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><circle cx="16" cy="6" r="2.5" fill="none" stroke="#555555" stroke-width="2"/><rect x="15" y="8.5" width="2" height="4.5" rx="1" fill="#555555"/><rect x="7" y="13" width="18" height="13" rx="3.5" fill="#ffffff" stroke="#555555" stroke-width="2"/><circle cx="12.5" cy="19.5" r="2.1" fill="#555555"/><circle cx="19.5" cy="19.5" r="2.1" fill="#555555"/></svg>',
});
