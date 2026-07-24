// Stubbed for the no-chain slice, mirroring ClaimPanel. The disabled buttons
// are the seam where a later slice swaps in wagmi/viem connect + a real burn
// (redeem) call, gated on the contract being deployed. Redemption is the
// inverse of Claim: entitlement leaving the system, supply shrinking.
export default function RedeemPanel() {
  return (
    <section style={{ marginTop: 38 }}>
      <div className="eyebrow">II. Redemption of Physical Beads</div>
      <p style={{ color: "var(--text-soft)" }}>
        Burn one (1) BEADZ to redeem one (1) physical bead. Redemption is
        irreversible: the token is destroyed and total supply shrinks; it is
        never reminted. Physical delivery is by prepaid certified mail with
        signature, in minimum lots, and costs far more than the beads are worth.
      </p>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        <span>Beads redeemed to date</span><span>0 burned</span>
      </div>
      <div className="meter">
        <div className="meter-fill" style={{ width: "0%" }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        <button disabled className="mono" style={btn}>Connect wallet</button>
        <button disabled className="mono" style={btn}>Redeem for beads</button>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-soft)" }}>Redemption opens at launch</span>
      </div>
    </section>
  );
}

const btn: React.CSSProperties = {
  border: "2px solid var(--line)", background: "transparent", color: "var(--text)",
  padding: "14px 22px", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600,
  opacity: 0.45, cursor: "not-allowed",
};
