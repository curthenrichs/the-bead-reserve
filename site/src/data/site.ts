import type {
  NavItem,
  SitemapGroup,
  EcosystemEntry,
} from "@half-built/astro/components/models.ts";
import { ECOSYSTEM_SELF_KEY } from "../lib/keys";

export const SITE_NAME = "The Bead Reserve";
export const SITE_URL = "https://beadz.half-built-robots.com";
export const TAGLINE = "Fully reserved. Worth nothing.";
export const DESCRIPTION =
  "A bead-collateralized token on Base with a webcam proof-of-reserves oracle. Fully reserved. Worth nothing.";

export const NAV: NavItem[] = [
  { label: "Reserve", href: "/" },
  { label: "Whitepaper", href: "/whitepaper.pdf" },
];

/* Must match the holder named in the repository LICENSE (spec
   amendment 7). */
export const LEGAL_HOLDER = "Curt Henrichs LLC";

export const FOOTER_SITEMAP: SitemapGroup[] = [
  {
    title: "Reserve",
    collapsible: true,
    phoneOpen: true,
    links: [
      { label: "The Bead Reserve", href: "/" },
      { label: "Read the whitepaper", href: "/whitepaper.pdf" },
      { label: "Brand assets", href: "/brand/" },
    ],
  },
  {
    title: "Rules",
    collapsible: true,
    links: [
      { label: "Policies", href: "/policies/" },
      { label: "Privacy", href: "/privacy/" },
      { label: "Terms", href: "/terms/" },
      { label: "Accessibility", href: "/accessibility/" },
    ],
  },
];

/* The baseline the ecosystem island replaces at runtime: this site
   plus a pointer home to the blog. */
export const ECOSYSTEM: EcosystemEntry[] = [
  { key: "beadz", label: SITE_NAME, href: "/" },
  {
    key: "blog",
    label: "Half-Built Robots",
    href: "https://half-built-robots.com/",
  },
];

export const ECOSYSTEM_SELF = ECOSYSTEM_SELF_KEY;
