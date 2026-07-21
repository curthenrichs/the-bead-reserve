// Genesis truth (hand-counted, canonical). No on-chain reads in this slice.
export const GENESIS_BEADS = 47318;

export const STATS = {
  reserve: `${GENESIS_BEADS.toLocaleString("en-US")} beads`,
  outstanding: `${GENESIS_BEADS.toLocaleString("en-US")} BEADZ`,
  collateralization: "100.0%",
} as const;
