import { useState } from "react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Subscribe() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setMsg({ text: "That address does not look deliverable. Check and retry.", err: true });
      return;
    }
    // WIRING: POST the email to the ESP here (deferred — stubbed for this slice).
    setMsg({ text: "Enrolled as correspondent. Dispatches are irregular by design.", err: false });
  }

  return (
    <section style={{ marginTop: 38 }}>
      <div className="eyebrow">II. Dispatches from the Vault Keeper</div>
      <p style={{ color: "var(--text-soft)", maxWidth: "50ch" }}>
        Occasional notice of future undertakings of questionable utility.
      </p>
      <form onSubmit={submit} noValidate style={{ display: "flex", border: "1px solid var(--hairline)" }}>
        <input aria-label="Email address" type="email" value={email}
          placeholder="you@somewhere.tld" onChange={(e) => setEmail(e.target.value)}
          className="mono" style={{ flex: 1, border: 0, padding: 14, background: "transparent",
            color: "var(--text)", minWidth: 0 }} />
        <button type="submit" className="mono"
          style={{ border: 0, borderLeft: "1px solid var(--hairline)", background: "var(--amber-dark)",
            color: "var(--text)", padding: "14px 22px", cursor: "pointer", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: ".1em" }}>
          Subscribe
        </button>
      </form>
      {msg && (
        <div className="mono" role="status" style={{ fontSize: 11, marginTop: 10,
          color: msg.err ? "var(--live)" : "var(--amber)" }}>{msg.text}</div>
      )}
    </section>
  );
}
