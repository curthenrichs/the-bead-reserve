// Genesis truth (hand-counted, canonical). No on-chain reads in this slice.
export const GENESIS_BEADS = 47318;

// No BEADZ contract exists on any chain yet (see the public README's
// "Canonicity" section). This stays null until a canonical contract is
// deployed to Base; scripts/build-tokenlist.mjs refuses to emit
// site/public/tokenlist.json while it's null, and validates it strictly
// (0x + 40 hex, zero address rejected) once it isn't -- a token list naming
// a wrong or fake address is worse than no token list at all, because
// wallets cache them. Setting this to the real, deployed contract address is
// the single change this repo needs to publish the token list at launch.
export const BEADZ_ADDRESS: string | null = null;

export const STATS = {
  reserve: `${GENESIS_BEADS.toLocaleString("en-US")} beads`,
  outstanding: `${GENESIS_BEADS.toLocaleString("en-US")} BEADZ`,
  collateralization: "100.0%",
} as const;
