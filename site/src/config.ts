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

// Fault Cam 01's Ed25519 public key, published by design: it is how
// anyone verifies a frame. The source of truth is ED25519_PUBKEY in
// service/wrangler.toml; change both together on a key rotation.
export const DEVICE_PUBKEY =
  "de649d130c8c7d559b424f1fbd7150b1dc18ffb00c33addaf8b171a2db049dfc";
