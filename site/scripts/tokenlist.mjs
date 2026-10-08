/**
 * Pure token-list construction: address validation, the token list object
 * (Uniswap token list format, the de facto standard wallets consume), a
 * deterministic serializer, and a tiny parser for src/config.ts's
 * BEADZ_ADDRESS declaration. No filesystem I/O lives here -- see
 * build-tokenlist.mjs for the CLI that reads config.ts and writes
 * site/public/tokenlist.json. Kept pure/import-safe the same way
 * brand/seal.mjs is, so tests can call these functions directly with
 * fabricated inputs (including deliberately-bad addresses) without editing
 * config.ts or touching the real public/ directory.
 */

export const CHAIN_ID = 8453; // Base mainnet
export const DECIMALS = 18;
export const SYMBOL = "BEADZ";
export const TOKEN_NAME = "The Bead Reserve";
export const LOGO_URI =
  "https://beadz.half-built-robots.com/beadz-token-256.png";
export const LIST_NAME = "The Bead Reserve (BEADZ)";

// The token list schema wants major/minor/patch and an ISO-8601 timestamp.
// Both are fixed, committed constants rather than derived from the build
// clock: Date.now() would make every run emit different bytes, breaking
// this repo's byte-determinism guarantee -- the same one brand/build.mjs's
// generated PNGs are held to (see .github/workflows/site.yml's "fail if
// committed brand assets drifted" step; this generator is designed to
// support the same kind of check). These two fields describe the *version
// of this list's schema/content*, not "the moment it was published," so
// they deliberately do NOT need to change when BEADZ_ADDRESS is set at
// launch -- that stays the single change config.ts's comment promises. Bump
// LIST_VERSION and LIST_TIMESTAMP together, by hand, only if the shape or
// metadata of the emitted list is deliberately revised later.
export const LIST_VERSION = { major: 1, minor: 0, patch: 0 };
export const LIST_TIMESTAMP = "2026-01-01T00:00:00Z";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

/** True only for a syntactically valid, non-zero EVM address. */
export function isValidAddress(address) {
  return (
    typeof address === "string" &&
    EVM_ADDRESS_RE.test(address) &&
    address.toLowerCase() !== ZERO_ADDRESS
  );
}

/**
 * Builds the token list object for a single address -- or throws a
 * descriptive Error for anything that isn't a real, non-zero EVM address.
 * The zero address is checked and rejected explicitly (not just folded into
 * the generic shape check) because it's syntactically a valid address and a
 * plausible accidental placeholder (an uninitialized variable, a copy-paste
 * default), not a typo -- it deserves its own message.
 */
export function buildTokenList(address) {
  if (typeof address !== "string" || address.length === 0) {
    throw new Error(
      `BEADZ_ADDRESS must be a non-empty string to publish a token list; got ${JSON.stringify(address)}.`,
    );
  }

  if (address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `BEADZ_ADDRESS is the zero address (${ZERO_ADDRESS}); refusing to publish a token list for a contract that doesn't exist.`,
    );
  }

  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(
      `BEADZ_ADDRESS "${address}" is not a valid EVM address; expected "0x" followed by exactly 40 hex characters.`,
    );
  }

  return {
    name: LIST_NAME,
    timestamp: LIST_TIMESTAMP,
    version: { ...LIST_VERSION },
    tokens: [
      {
        chainId: CHAIN_ID,
        address,
        name: TOKEN_NAME,
        symbol: SYMBOL,
        decimals: DECIMALS,
        logoURI: LOGO_URI,
      },
    ],
  };
}

/** Deterministic serialization: same input, same bytes, every time. */
export function serializeTokenList(list) {
  return `${JSON.stringify(list, null, 2)}\n`;
}

const ADDRESS_DECL_RE =
  /export const BEADZ_ADDRESS\s*:\s*string \| null\s*=\s*([^;]+);/;

/**
 * Extracts BEADZ_ADDRESS's declared value from src/config.ts's source text:
 * null, or the raw (unvalidated -- callers must still run it through
 * buildTokenList/isValidAddress) string literal contents.
 *
 * A plain-text regex rather than a real TypeScript import, because
 * config.ts uses TS type syntax (`: string | null`) that plain Node can't
 * parse, and this repo already treats source files as text-to-assert-on
 * elsewhere (test/layout.test.mjs's frontmatter/head splitting,
 * brand/build.test.mjs reading .gitignore). Throws if the declaration's
 * shape has drifted, so a future refactor of config.ts fails loudly here
 * instead of this parser silently returning the wrong thing.
 */
export function parseBeadzAddress(configSource) {
  const match = configSource.match(ADDRESS_DECL_RE);

  if (!match) {
    throw new Error(
      "could not find `export const BEADZ_ADDRESS: string | null = ...;` in src/config.ts -- has its declaration shape changed?",
    );
  }

  const raw = match[1].trim();
  if (raw === "null") return null;
  const stringLiteral = raw.match(/^(["'])(.*)\1$/);

  if (!stringLiteral) {
    throw new Error(
      `BEADZ_ADDRESS is set to an expression this parser doesn't understand: ${raw}`,
    );
  }

  return stringLiteral[2];
}
