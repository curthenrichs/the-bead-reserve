# The Bead Reserve

**A bead-collateralized token on Base with a webcam proof-of-reserves oracle. Fully reserved. Worth nothing.**

BEADZ is a fixed-supply novelty ERC-20 on [Base](https://base.org), "fully reserved" by a physical jar
of glass seed beads in a cardboard box under a webcam. It is a deadpan parody of a reserve-backed
stablecoin: real proof-of-reserves plumbing, real redemption mechanics, and a real institutional-style
whitepaper, all wrapped around an asset that is worth nothing, on purpose.

> BEADZ has no monetary value, targets no monetary value, and is issued solely for amusement.
> It is **not a stablecoin**, not pegged to any national currency, and not redeemable for cash.
> One (1) bead ≈ one (1) bead.

---

## How it works

There is a jar. In the jar are **47,318** mixed-color glass seed beads, hand-counted once at genesis;
that Genesis Count is declared canonical and is never re-litigated. The jar sits in an LED-lit
cardboard box under a camera that publishes stills on a schedule.

On chain, exactly one BEADZ is minted per bead, for a fixed supply of 47,318 tokens (18 decimals). The
token is "reserved" by the jar in the most literal sense available: the number on chain is meant to
equal the number of beads in the box, and the camera exists so anyone can watch the reserve.

The only operation available after genesis is **destruction via redemption**. Supply can only shrink.
The terminal state of the whole system is an empty jar in a box.

## Token mechanics

- **Fixed supply, no mint path.** The entire supply is minted once in the constructor. There is no
  `mint` function afterward. The supply cap is enforced by absence, which is stronger than any
  renounce ceremony.
- **Airdrop-only claim, no liquidity pool.** Supply is distributed by claim, one per address. The
  project seeds no market and endorses none.
- **Peg to beads, not dollars.** "1 BEADZ = 1 bead" is a collectible peg, not a monetary one. BEADZ
  makes no representation of a stable value against any currency.
- **Redemption is a one-way ratchet.** `redeem()` burns tokens in exchange for a physical shipment of
  beads. Redeemed tokens are gone; supply never grows back.
- **The redemption window can only widen.** It may be extended outward or reopened after a lapse, capped
  per action, but never shortened on live holders, so the redemption right cannot be rugged.

## The Vault Keeper

A single role, the **Vault Keeper**, runs operations, and it is deliberately powerless over tokens.
The Keeper can log bead recounts, acknowledge shipments, and widen the redemption window. It
**cannot** mint, move, freeze, or seize any tokens. A compromised or lost Keeper costs no value, only
continuity, and there is no recovery backdoor by design. The response to a lost key is to redeploy a
fresh canonical contract rather than bolt on an attack surface larger than the role it would protect.

## Proof of reserves

The reserve can be watched, not just claimed. The intended pipeline:

1. A small always-on capture device photographs the jar on a schedule.
2. Each still is hashed (SHA-256) and the hash is signed with an **Ed25519** key whose public half is
   published, so anyone can verify a frame is authentic and fresh.
3. The image and its hash are published; the Keeper later attests the hash on chain.

Capture and attestation are separate jobs. The camera device holds no chain key. The claim site at
[beadz.half-built-robots.com](https://beadz.half-built-robots.com) surfaces a three-state monitor
(fresh / stale / dark) so a viewer can see at a glance whether the reserve is currently in view.

## Contract surface

Built on OpenZeppelin ERC-20 v5.1.0, Solidity `0.8.24`.

**Constructor:** `constructor(address keeper, address treasury_, uint256 airdropBeads)`

**Constants:** `GENESIS_BEADS = 47_318` · `CLAIM_AMOUNT = 1e18` · `MIN_REDEMPTION = 1e18` ·
`MAX_EXTENSION = 366 days`

**Functions:** `claim()` · `surrender(amount)` · `redeem(amount, shippingRef)` ·
`attestBeadCount(beads)` *[keeper]* · `acknowledgeRedemption(bearer, beads, trackingNumber)` *[keeper]* ·
`attestReserveRecord(merkleRoot, uri)` *[keeper]* ·
`setRedemptionDeadline(newDeadline)` *[keeper]* · `transferVaultKeeper(action, newKeeper, confirmKeeper)` *[keeper]* ·
`unclaimedBeads()` · `redemptionOpen()` · `collateralizationBps()` · plus standard ERC-20.

**Events:** `BeadClaimed` · `GenesisAllocated` · `BeadCountAttested` · `PhysicalBeadRedemptionRequested`
· `BeadsSurrendered` · `RedemptionAcknowledged` · `ReserveRecordAttested` · `RedemptionWindowSet` · `VaultKeeperTransferred`.

There is no `mint` in the surface. Fixed supply is confirmed by absence.

## Repository layout

This repository has three independent parts:

| Path | What it is | Status |
|---|---|---|
| `contract/` | The BEADZ ERC-20 (Foundry project: build, tests, Slither) | Built |
| `camera/` | Physical attestation / webcam infrastructure | Reserved |
| `whitepaper/` | Typst source for the whitepaper | Reserved |

`Reserved` paths exist in the tree as placeholders; their contents land as each subsystem clears review.

### Verifying the contract

```bash
# clone with --recurse-submodules, or run: git submodule update --init --recursive
cd contract
forge build
forge test              # unit + fuzz/invariant
slither . --config-file slither.config.json   # static analysis
bash script/run-slither.sh                    # same, but bootstraps slither + solc 0.8.24 first
bash script/local-rehearsal.sh                # deploy + full lifecycle on a disposable Anvil chain
```

The claim and proof-of-reserves front-end is hosted at
[beadz.half-built-robots.com](https://beadz.half-built-robots.com) and is not part of this repository.

## Status

**Pre-deploy.** The contract compiles cleanly and ships with a Foundry unit + fuzz/invariant test
suite and a Slither static-analysis gate; see "Verifying the contract" above to run them yourself.
Deployed contract addresses will be added here after the contract is deployed to Base and its source
is verified on Basescan.

### Canonicity

**No BEADZ has been deployed to any chain.** When the canonical contract exists, its address will
appear here and at [beadz.half-built-robots.com](https://beadz.half-built-robots.com) — nowhere
else. Until then, any token wearing this name or ticker is not this project and holds no claim on
the jar. One tell is definitive: the genuine BEADZ seeds no liquidity pool and never will, so any
"BEADZ" you can buy is, by construction, a counterfeit bead reserve. The counterfeit is also worth
nothing, but less honestly.

## Reserve facts

- **Genesis supply:** 47,318 BEADZ, the hand-counted Genesis Count, error and all, declared canonical.
- **Decimals:** 18. The smallest unit is one "bead-wei." Beads are physically indivisible but digitally
  divisible.
- **The reserve:** mixed-color glass seed beads, one mason jar, one cardboard box, LED-lit, photographed
  on a schedule. It is modest and easy to reconstitute, so no single jar is essential.

## Disclaimers

These are statements of design intent, made in earnest, and are not legal, financial, or tax advice:

- **Not a payment stablecoin.** BEADZ is pegged to beads, a physical collectible, not to a fixed amount
  of monetary value, and is not designed for payment or settlement.
- **Not a security.** BEADZ is sold to no one, promises no return, funds no enterprise, and creates no
  expectation of profit from the efforts of others.
- **Not a deposit or payment instrument,** and not federally insured (there is nothing to insure but
  beads).
- **Has no monetary value and is not expected to acquire any.** This is by design, not by accident.

"Can I buy it?" No. It's worth nothing. That's the point.

## License

MIT. Fork it, deploy your own vault, reserve your own beads.

---

*One (1) bead ≈ one (1) bead.*
