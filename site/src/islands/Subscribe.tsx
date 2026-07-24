import { useState } from "react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Deliberately NOT part of the numbered reserve record (Certificate / Redemption
// / Disclaimer / Signatory). This is a standalone amber call-to-action pinned
// just before the footer, and it's the bridge back to the wider
// half-built-robots blog: BEADZ is one project of many, and the newsletter is
// the shared thread across all of them. Meant to read the same on the blog and
// every project, not as a section of this page's ledger.
export default function Subscribe() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setMsg({ text: "That address does not look deliverable. Check and retry.", err: true });
      return;
    }
    // WIRING: POST the email to the ESP here (deferred, stubbed for this slice).
    setMsg({ text: "Enrolled as correspondent. Dispatches are irregular by design.", err: false });
  }

  return (
    <section style={{ marginTop: 56, background: "var(--amber)", color: "#1b140c",
      padding: "clamp(24px,4vw,44px)", border: "3px solid #1b140c",
      outline: "3px solid #1b140c", outlineOffset: "-10px",
      boxShadow: "0 8px 30px rgba(38,32,26,.22)" }}>
      <div className="eyebrow" style={{ color: "#1b140c" }}>half-built-robots.com</div>
      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 600, lineHeight: 1.05,
        fontSize: "clamp(24px,4vw,34px)", margin: "10px 0 8px" }}>
        Plenty more where this came from
      </h2>
      <p style={{ margin: "0 0 6px" }}>
        The Bead Reserve is one of many half-built experiments in the workshop.
        Have a look around the rest, and leave an address to hear about new ones
        as they leave the bench.
      </p>
      <p style={{ margin: "0 0 18px" }}>
        <a href="https://www.half-built-robots.com" className="mono"
          style={{ color: "#1b140c", fontWeight: 600 }}>Browse the projects &rarr;</a>
      </p>
      <form onSubmit={submit} noValidate style={{ display: "flex", flexWrap: "wrap",
        border: "2px solid #1b140c", maxWidth: 520, background: "#fff" }}>
        <input aria-label="Email address" type="email" value={email}
          placeholder="you@somewhere.tld" onChange={(e) => setEmail(e.target.value)}
          className="mono" style={{ flex: 1, border: 0, padding: 14, background: "transparent",
            color: "#1b140c", minWidth: 0 }} />
        <button type="submit" className="mono"
          style={{ border: 0, background: "#1b140c", color: "#fff", padding: "14px 26px",
            cursor: "pointer", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>
          Subscribe
        </button>
      </form>
      {msg && (
        <div className="mono" role="status" style={{ fontSize: 12, marginTop: 12, fontWeight: 600,
          color: msg.err ? "#7a1f16" : "#1b140c" }}>{msg.text}</div>
      )}
    </section>
  );
}
