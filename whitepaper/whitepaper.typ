#import "template.typ": whitepaper, plabel, param-table, green
#import "metadata.typ": meta

#show: whitepaper.with(
  title: "BEADZ: A Fully-Reserved Bead-Collateralized Bearer Instrument",
  subtitle: "A Technical and Monetary Whitepaper of The Bead Reserve",
  office: meta.office,
  series: meta.series,
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
on it. There is no custodian, no rehypothecation, and no maturity
mismatch, because beads do not earn yield and cannot be lent out, a
property we consider a feature.

The remainder of this document specifies the reserve, the
proof-of-reserve mechanism, the token, its distribution and redemption,
and the deliberately minimal governance that surrounds it.

= 2. The Reserve
The reserve consists of *#meta.genesis* glass seed beads (nominal; see §3
on the genesis count) of mixed color, held loose in one (1) standard
mason jar. The jar is stored inside a cardboard box (the "Fault") at an
undisclosed interior location. The beads are indivisible; the jar is not
insured; the box is not fireproof. These limitations are disclosed in the
interest of the radical transparency the reserve is designed to provide.

No bead may leave the Fault except through the redemption process
specified in §6. Beads are never added after genesis. The reserve is
therefore, like the token, a strictly non-increasing quantity.

= 3. Proof of Reserves

== 3.1 The genesis count
At genesis, the beads were poured into the jar and counted once, by hand,
in private. The resulting figure — the *Genesis Count* — was enshrined as
total supply and is final. The Vault Keeper makes no representation that
the Genesis Count is arithmetically correct, only that it is honestly
reported. A hand-count of several tens of thousands of small beads is
understood to carry error. Any such error is hereby declared canonical:
the reserve is defined as whatever was counted, not whatever is true.

The count itself was not witnessed by camera; the Vault Keeper is shy.
The camera's role begins afterward and is different in kind. It does not
verify the count but attests, continuously and thereafter, that the
sealed jar has not been opened or disturbed since. The Reserve thus
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
  ("Genesis supply", meta.genesis + " BEADZ  (= the Genesis Count)"),
  ("Peg", "1 BEADZ = 1 bead (collectible, not monetary)"),
  ("Mint authority", "None after construction"),
  ("Supply trajectory", "Non-increasing; reducible only by redemption"),
))

Although a bead is physically indivisible, #meta.symbol is divisible to
10#super[-#meta.decimals]. The smallest unit is one *bead-wei*. The Bead
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
Keeper's *discretionary reserve* (the "treasury"), for hand-distribution
— gifts and airdrops to correspondents at the Keeper's discretion. The
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
Redemption is available only in lots of *#meta.min_redemption beads or
greater* (the "creation unit"). This mirrors the authorized-participant
model of exchange-traded funds, in which shares are created and redeemed
only in large blocks, and has the additional effect that the cost of the
certified-mail ceremony exceeds the value of the beads by several orders
of magnitude. Redemption is thus a right that no rational holder
exercises, which is precisely what keeps the reserve stable.

== 6.3 Two-legged settlement
A redemption has a *crypto leg* and a *postal leg*. The crypto leg is the
on-chain burn, which is instantaneous and final. The postal leg is the
physical shipment; its finality is the delivery signature. Upon shipment
the Vault Keeper records the tracking number on-chain via
`acknowledgeRedemption`, so that each redemption produces a complete,
auditable cross-domain settlement record — a genuine two-legged
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
only ever be widened, never narrowed — a renewal the Reserve must
affirmatively perform, or allow to lapse.

Should the window lapse and not be reopened, physical redemption ceases
and #meta.symbol persists as a pure collectible: the tokens transfer and
exist as before, but carry no further claim on the Fault, whose contents
pass into permanent, unredeemable repose. The jar remains, lit and
photographed hourly, for no reason.
