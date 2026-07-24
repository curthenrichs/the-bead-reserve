import { GENESIS_BEADS } from "../config";

// Stubbed for the no-chain slice. The disabled buttons are the seam where a
// later slice swaps in wagmi/viem connect + a real claim() call.
export default function ClaimPanel() {
  const total = GENESIS_BEADS.toLocaleString();
  return (
    <section style={{ marginTop: 38 }}>
      <div className="eyebrow">I. Certificate of Bead Entitlement</div>
      <p style={{ color: "var(--text-soft)" }}>
        Claim one bead from the genesis mint. The reserve stays full; only the entitlement transfers.
      </p>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        <span>Genesis distribution</span><span>0 / {total} claimed</span>
      </div>
      <div className="meter">
        <div className="meter-fill" style={{ width: "0%" }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        <button disabled className="mono" style={btn}>Connect wallet</button>
        <button disabled className="mono" style={btn}>Claim your bead</button>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-soft)" }}>Claim opens at launch</span>
      </div>
    </section>
  );
}

const btn: React.CSSProperties = {
  border: "2px solid var(--line)", background: "transparent", color: "var(--text)",
  padding: "14px 22px", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600,
  opacity: 0.45, cursor: "not-allowed",
};
