#import "template.typ": whitepaper, param-table, ink-soft, hairline
#import "metadata.typ": meta

#show: whitepaper.with(
  title: "BEADZ: A Fully-Reserved Bead-Collateralized Bearer Instrument",
  title-lines: ("BEADZ: A Fully-Reserved", "Bead-Collateralized Bearer Instrument"),
  subtitle: "A Technical and Monetary Whitepaper of The Bead Reserve",
  office: meta.office,
  series: meta.series,
  draft: true,
)

= Abstract
We present #meta.symbol, a digital bearer token fully and continuously
collateralized by a physical reserve of glass seed beads held in a sealed
jar (the "Fault") and observed by camera. Each #meta.symbol is redeemable
for one (1) bead. Unlike collateralized instruments whose reserves are
attested by quarterly reports from an accounting firm, the #meta.symbol
reserve is attested by a webcam pointed at a jar, which we contend is a
strict improvement in both latency and honesty. Total supply is minted
once and is thereafter permanently non-increasing; the only monetary
operation available after genesis is destruction via redemption.
#meta.symbol has no monetary value, targets no monetary value, and is
issued solely for amusement.

= 1. Introduction
Modern reserve-backed tokens rest on a chain of trust: the holder trusts
the issuer, the issuer trusts a custodian bank, the bank trusts its own
ledger, and an auditor trusts all of the above on a delay of roughly
ninety days. Each link is a place where the reserve can quietly fail to
exist.

#meta.symbol collapses this chain to a single physical object a person
can see. The reserve is a jar. The jar is in a box. The box has a camera
in it pointed at the jar. There is no custodian, no rehypothecation, and no maturity
mismatch, because beads do not earn yield and cannot be lent out, a
property we consider a feature.

The remainder of this document specifies the reserve, the
proof-of-reserve mechanism, the token, its distribution and redemption,
and the deliberately minimal governance that surrounds it.

= 2. The Reserve
The reserve consists of *#meta.genesis* glass seed beads (nominal; see §3
on the genesis count) of mixed color, held loose in one (1) standard
glass jar. The jar is stored inside a cardboard box (the "Fault") at an
undisclosed interior location. The beads are indivisible; the jar is not
insured; the box is not fireproof. These limitations are disclosed in the
interest of the radical transparency the reserve is designed to provide.

No bead may leave the Fault except through the redemption process
specified in §6. Beads are never added after genesis. The reserve is
therefore, like the token, a strictly non-increasing quantity.

= 3. Proof of Reserves

== 3.1 The genesis count
At genesis, the beads were poured into the jar and counted once, by hand,
in private. The resulting figure, the *Genesis Count*, was enshrined as
total supply and is final. The Vault Keeper makes no representation that
the Genesis Count is arithmetically correct, only that it is honestly
reported. A hand-count of several tens of thousands of small beads is
understood to carry error. Any such error is hereby declared canonical:
the reserve is defined as whatever was counted, not whatever is true.

The count itself was not witnessed by camera; the Vault Keeper is shy.
The camera's role begins afterward and is different in kind. It does not
verify the count but attests, continuously and thereafter, that the
sealed jar has not been opened or disturbed since (except through the redemption process). The Reserve thus
proves *continuity of custody*, not the tally: the quantity is
established once, under trust, and the seal is monitored forever.

== 3.2 Continuous attestation
A camera ("Fault-Cam 01") observes the jar and captures periodic images.
Each image is hashed and the hash is recorded on-chain alongside an
`attestBeadCount` call, producing a tamper-evident, timestamped feed of
the reserve's status. This is functionally identical to a commercial
proof-of-reserve oracle, differing only in that the underlying asset is
beads and the oracle is a webcam.

== 3.3 Automated audit (optional module)
A small vision-language model may be pointed at the camera feed to
produce a periodic audit in the institutional register, e.g.:

#quote(block: true)[Reserve audit complete. Jar present. Lid seated. Bead
level nominal. Collateralization ratio: 100.0%. The Fault remains
secure.]

The model is designated *Chief Reserve Officer*. Its findings are
advisory. It cannot count the beads but may, from time to time, claim to.

= 4. Token Design
#meta.symbol is a standard ERC-20 token deployed on #meta.chain.

#param-table((
  ("Name / Symbol", "Beadz / BEADZ"),
  ("Decimals", meta.decimals),
  ("Genesis supply", meta.genesis + " BEADZ (= the Genesis Count)"),
  ("Peg", "1 BEADZ = 1 bead (collectible, not monetary)"),
  ("Mint authority", "None after construction"),
  ("Supply trajectory", "Non-increasing; reducible only by redemption"),
))

Although a bead is physically indivisible, #meta.symbol is divisible to
10#super[−#meta.decimals]. The smallest unit is one *bead-wei*. The Bead
Reserve makes no attempt to explain what one quintillionth of a bead is
and advises holders against redeeming for one.

The supply guarantee is structural rather than promissory. The contract
contains no owner, no minter role, and no mint path of any kind; the
entire supply is created in a single constructor call and the capability
is then simply absent. There is nothing to renounce because there is
nothing to hold.

= 5. Distribution
#meta.symbol is distributed in two ways, both settled at genesis from a
single fixed supply: an *open genesis claim* and a *discretionary
reserve*. There is no sale, no presale, and no liquidity pool created or
endorsed by the Bead Reserve.

At deployment the full supply is minted once and split between (i) the
token contract, which holds the *open-claim pile*, and (ii) the Vault
Keeper's *discretionary reserve* (the "treasury"), for hand-distribution:
gifts and airdrops to correspondents at the Keeper's discretion. The
split is carved from the fixed genesis supply, not minted in addition to
it: it changes neither total supply nor collateralization, and dilutes no
one, there being nothing to dilute. The size of each portion is fixed at
deployment and disclosed on-chain via the `GenesisAllocated` event.

Any wallet may call `claim()` once to receive one (1) #meta.symbol from
the open-claim pile, paying only network gas. Claiming distributes
pre-existing supply; it does not mint, and it does not remove any bead
from the Fault. Only the entitlement moves.

A holder may also *surrender* #meta.symbol back to the open-claim pile at
any time, returning the tokens to circulation for others to claim and
reopening their own eligibility to claim again. Surrender does not burn:
supply and reserve are unchanged; the beads simply return to the pile.
The Reserve offers this facility for holders who have reflected on their
position and offers no opinion on why one would relinquish a free bead.

Because no market is created, #meta.symbol has no price and no means of
sale at issuance. It is a collectible. Holders wishing it had a price are
directed to §9.

= 6. Redemption and Settlement

== 6.1 Physical redemption
A holder may destroy #meta.symbol to claim the corresponding beads.
Redemption is settled physically, by *prepaid certified mail with
signature confirmation*, in keeping with the standard of care appropriate
to a bearer instrument. The redeemer bears all postage.

The Reserve does *not* require or provide insurance on redemption
shipments; no policy underwrites glass beads and none is warranted.
Redemption is *final upon burn*: the on-chain destruction is
irreversible, and the Reserve does not reship, refund, or re-mint. Risk
of loss passes to the redeemer at burn. A bead lost in transit is, for
all purposes, a bead redeemed. The redeemer has been advised the contents
are worthless and proceeds accordingly.

Upon redemption, the Vault Keeper will identify the specific bead or
beads corresponding to the particular #meta.symbol token IDs surrendered,
drawing on institutional knowledge of the reserve to match each burned
token to its bead in the jar. Retrieval is physical and manual, and may
require fishing the bead out, performed to the best of the Vault Keeper's
ability. The Reserve represents that this mapping is exact and declines
to elaborate on how it is maintained.

== 6.2 Minimum redemption lot
Redemption is available in lots of *#meta.min_redemption bead or
greater* (the "creation unit"). Because the cost of the certified-mail
ceremony exceeds the value of a single bead by several orders of
magnitude, redemption — though unrestricted in size — is a right that no
rational holder exercises, which is precisely what keeps the reserve
stable.

== 6.3 Two-legged settlement
A redemption has a *crypto leg* and a *postal leg*. The crypto leg is the
on-chain burn, which is instantaneous and final. The postal leg is the
physical shipment; its finality is the delivery signature. Upon shipment
the Vault Keeper records the tracking number on-chain via
`acknowledgeRedemption`, so that each redemption produces a complete,
auditable cross-domain settlement record, a genuine two-legged
settlement for imaginary money.

== 6.4 The ratchet
Redemption burns the tokens, permanently reducing total supply, and
removes the corresponding beads from the Fault. Outstanding #meta.symbol
therefore always equals the beads still owed, and the system can only
ever move in one direction: toward an empty jar in a box, still lit,
still on camera. This terminal state is acknowledged and accepted.

== 6.5 The redemption window
Physical redemption is time-boxed. It opens at genesis and remains open
for one (1) year. The Vault Keeper may, by a deliberate on-chain act,
*extend* an open window outward or *reopen* a lapsed one, in each case by
at most approximately one year per action. The Keeper can never shorten a
window that is currently open; the redemption right, once granted, cannot
be withdrawn from a holder able to exercise it. In effect the window can
only ever be widened, never narrowed: a renewal the Reserve must
affirmatively perform, or allow to lapse.

Should the window lapse and not be reopened, physical redemption ceases
and #meta.symbol persists as a pure collectible: the tokens transfer and
exist as before, but carry no further claim on the Fault, whose contents
pass into permanent, unredeemable repose. The jar remains, lit and
photographed hourly, for no reason.

= 7. Monetary Policy
There is none. Supply is fixed at genesis and can only decline. There is
no issuance schedule, no staking, no yield, no rebasing, and no
discretionary monetary authority. The Bead Reserve considers the absence
of a monetary policy to be its monetary policy.

= 8. Governance
Governance is minimized to a single role, the *Vault Keeper*, whose
on-chain powers are deliberately confined to:

- logging bead recounts (`attestBeadCount`);
- acknowledging shipments (`acknowledgeRedemption`);
- extending or reopening the redemption window
  (`setRedemptionDeadline`), a power that can only ever widen access,
  never remove it; and
- rotating its own key (`transferVaultKeeper`), where the new key must be
  confirmed twice to prevent a mistype, or retiring the role permanently
  through a separate, deliberate freeze.

The Vault Keeper *cannot* mint, move, freeze, or seize any holder's
tokens. The role holds no power over balances and is therefore operable
as a low-value hot key without endangering the system. Key hygiene is the
Keeper's own concern; a compromised Keeper key can, at worst, publish
dishonest bead counts, which the camera would contradict, or widen a
redemption window, which harms no one.

== 8.1 Compromise, loss, and redeployment
There is *no administrative override*. `transferVaultKeeper` is callable
only by the sitting Keeper, so a lost Keeper key cannot be recovered, and
a compromised one cannot be forcibly reclaimed, through the contract.
This is deliberate: a backdoor able to rescue the Keeper would be a
larger attack surface than the powerless role it protects.

Because the Keeper controls no tokens, a compromise or loss costs no
value: only continuity. The response is to *redeploy*: a fresh contract
is published with a new Keeper, and the Reserve designates it the
canonical #meta.symbol. For holders, this means:

- The superseded contract and its tokens continue to exist, harmlessly,
  at their old address; they are simply no longer canonical. An attacker
  holding the old Keeper key controls only that deprecated contract's
  valueless attestation functions.
- Because a single jar can back only one token at a time, the physical
  reserve backs whichever contract the Reserve currently designates
  canonical, as announced on the site and in this document. Redemption
  is honored only against the canonical contract.
- Holders of a superseded series are made whole, if at all, by snapshot
  and re-airdrop at the Reserve's sole discretion; migration is not
  automatic. For a collectible of no value, the Reserve may also decline
  to migrate and let the prior series stand as a historical artifact.

In short: a Keeper compromise resets the token's address and continuity.
It moves no balances and touches no reserve: the contract itself never
transfers a holder's tokens.

= 9. Risk Factors
Prospective holders should be aware:

- *#meta.symbol has no monetary value and is not expected to acquire
  any.* This is by design, not misfortune.
- *There is no market.* No pool is provided; there is nowhere to sell.
- *The reserve is uninsured* and stored in a cardboard box.
- *The Genesis Count may be wrong.* See §3.1.
- *Redemption costs vastly more than the beads are worth.* See §6.2.
- *A third party could, without authorization or endorsement, create a
  market for #meta.symbol.* Any such market, price, or loss arising from
  it is that party's doing and risk, not the Bead Reserve's. Holders who
  choose to transact in such a market do so entirely at their own risk.
- *The contract may be superseded.* On loss or compromise of the Keeper
  key there is no recovery path; #meta.symbol may be redeployed, and the
  canonical token is whichever the Reserve designates. A superseded
  series is not automatically migrated and may be left standing as a
  historical artifact.
- *Redemption is time-boxed and may lapse.* The window is open one year
  at genesis and is renewed only if the Vault Keeper affirmatively
  extends or reopens it. If it lapses without reopening, physical
  redemption ends permanently and #meta.symbol continues as a
  collectible with no claim on the Fault.
- *Loss of one's wallet keys results in permanent loss of one's beads,*
  which remain in the jar, visible on camera, forever out of reach.
- *Continuity of operations under civilizational stress.* In the event
  of prolonged infrastructure failure or societal collapse, the
  Reserve's monitoring and audit functions should be expected to
  degrade. Fault-Cam 01 depends on power and network and will go dark;
  the Chief Reserve Officer depends on both and on continued inference
  availability, and will cease to file its attestations, spurious or
  otherwise. The on-chain record persists only so long as the underlying
  network does. The physical reserve, however, is comparatively robust:
  it is a jar, inside a cardboard box, and requires nothing to continue
  existing. The Vault Keeper undertakes to secure the box for as long as
  is practicable. It remains uninsured. No provision has been made for
  its recovery from fire, flood, or looting, the beads being judged
  unlikely to attract any of the three. The Reserve further notes that
  its collateral is portable and reconstitutable at negligible cost: no
  single physical jar is essential, and should any specific jar be lost,
  compromised, or merely become inconvenient, an identical reserve may
  be re-poured elsewhere and re-attested. In any such reconstitution the
  Vault Keeper will color-match the replacement beads to the lost
  reserve as closely as can be managed, so that the new jar approximates
  the old. There is, in the end, nothing here worth coming for.

= 10. Legal and Regulatory Positioning
#meta.symbol is a novelty collectible issued for amusement. The Bead
Reserve takes the following positions, which are statements of design
intent and not legal advice:

- *Not a payment stablecoin.* #meta.symbol is pegged to beads, a
  physical collectible, not to a fixed amount of monetary value. It
  makes no representation of a stable value relative to any national
  currency and is not designed for payment or settlement of monetary
  obligations. It is accordingly outside the definition of a "payment
  stablecoin" under applicable federal law.
- *Not a security.* #meta.symbol is sold to no one, promises no return,
  funds no enterprise, and creates no expectation of profit from the
  efforts of others.
- *Not a deposit or payment instrument,* and not federally insured
  (there is nothing to insure but beads).
- *Issued for own account.* The Bead Reserve does not exchange,
  transfer, store, or administer digital assets on behalf of others, and
  operates no market on their behalf.

These disclaimers appear on every public-facing surface of the project
and are made in earnest.

= 11. Roadmap
The Bead Reserve is skeptical of roadmaps. The following are
acknowledged as possible future undertakings of questionable utility, in
no committed order:

- a second jar
- a bead of unusual color held as a strategic reserve asset
- a governance proposal to change nothing
- a printed annual report audited by the Chief Reserve Officer

None of these are promised. Subscribers to the Vault Keeper's dispatches
will be notified if any occur.

= 12. Conclusion
#meta.symbol demonstrates that the full apparatus of a reserve-backed
digital bearer instrument (collateral, proof of reserves, redemption,
settlement, and disciplined monetary policy) can be implemented
honestly, cheaply, and in its entirety around an asset of no value. A
system which is completely transparent, fully reserved, structurally
incapable of inflation, and worth nothing sounds like a contradiction. We
submit that it is an achievement.

The jar is on camera. The count is final. One bead is one bead.

= Appendix A: Glossary

/ Bead-wei: the smallest divisible unit of BEADZ, 10#super[−#meta.decimals] of a bead. Non-redeemable in practice.
/ The Fault: the cardboard box containing the reserve jar. Named for a vault that is also a structural flaw.
/ Creation unit: the minimum redemption lot (#meta.min_redemption bead), below which physical redemption is disallowed.
/ Genesis Count: the one-time hand-count of the jar at deployment, defining total supply.
/ The ratchet: the property that supply and reserve can only decrease, via redemption.

= Appendix B: Contract Summary
Deployed on #meta.chain. Built on OpenZeppelin's audited ERC-20. Key
entry points:

- `claim()`: receive one bead from the genesis mint (one per address).
- `surrender(amount)`: return #meta.symbol to the open-claim pile for
  redistribution (does not burn; reopens your claim).
- `redeem(amount, shippingRef)`: burn ≥#meta.min_redemption bead to
  request physical shipment, while the redemption window is open.
  `shippingRef` is an off-chain reference only; no postal address is
  ever written on-chain.
- `redemptionOpen()` / `redemptionDeadline`: current redemption-window
  status.
- `setRedemptionDeadline(newDeadline)`: Vault Keeper only. Extends an
  open window or reopens a lapsed one, capped at ~1 year per action;
  cannot shorten an open window.
- `attestBeadCount(beads)` / `acknowledgeRedemption(...)`: Vault Keeper
  attestation and shipment logs.
- `collateralizationBps()`: attested beads vs. outstanding supply, in
  basis points.

Contract address: #emph(meta.contract)

#v(1.2em)
#line(length: 100%, stroke: 0.5pt + hairline)
#v(0.6em)
#block(text(style: "italic", fill: ink-soft, size: 9.5pt)[
  This document is a draft for public comment. BEADZ is a joke that is fully
  collateralized. It has no monetary value and is not an offer of, or
  solicitation to buy, anything. Nothing herein is financial, legal, or
  horticultural advice. One (1) bead ≈ one (1) bead.
])
