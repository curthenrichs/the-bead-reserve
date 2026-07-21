import { useEffect, useState } from "react";

type Status = "fresh" | "stale" | "dark";
interface Reserve {
  frameUrl: string | null;
  counter: number | null;
  ts: number | null;
  sha256: string | null;
  croText: string | null;
  status: Status;
}

const COPY: Record<Status, string> = {
  fresh: "REC · reserve in view",
  stale: "signal delayed — last frame retained",
  dark: "signal interrupted — reserve remains sealed",
};

export default function CameraMonitor({ pollMs = 60_000 }: { pollMs?: number }) {
  // Start in the dark state: it is the honest default until the Worker is
  // deployed and a camera has pushed. A failed/empty fetch stays here.
  const [r, setR] = useState<Reserve>({ frameUrl: null, counter: null, ts: null,
    sha256: null, croText: null, status: "dark" });

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/reserve");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Reserve;
        if (alive) setR(body);
      } catch {
        if (alive) setR((prev) => ({ ...prev, status: "dark" }));
      }
    }
    poll();
    if (pollMs > 0) {
      const id = setInterval(poll, pollMs);
      return () => { alive = false; clearInterval(id); };
    }
    return () => { alive = false; };
  }, [pollMs]);

  const showFrame = r.status !== "dark" && r.counter !== null;
  // The dark placeholder text is the single source of the "sealed" message —
  // the caption is suppressed in the dark state so the two never render the
  // same text simultaneously (which would break a singular getByText query).
  const captionText = r.status === "dark"
    ? null
    : `${r.status === "fresh" ? COPY.fresh : COPY.stale}${r.croText ? ` · ${r.croText}` : ""}`;
  return (
    <div style={{ border: "1px solid var(--hairline)", background: "var(--monitor-bg)", margin: "24px 0" }}>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between",
        fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase",
        padding: "6px 9px", color: "var(--text-soft)", borderBottom: "1px solid var(--hairline)" }}>
        <span>Reserve Monitoring — Cam 01</span>
        <span style={{ color: r.status === "fresh" ? "var(--live)" : "var(--text-soft)" }}>
          {r.status === "fresh" ? "● LIVE" : "○ IDLE"}
        </span>
      </div>
      <div style={{ position: "relative", aspectRatio: "16 / 10", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        {showFrame ? (
          <img src="/api/frame/latest" alt="Camera view of the reserve jar"
            loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="mono" style={{ color: "var(--text-soft)", fontSize: 12, padding: 16, textAlign: "center" }}>
            {COPY.dark}
          </span>
        )}
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--text-soft)", padding: "6px 9px",
        borderTop: "1px solid var(--hairline)" }}>
        {captionText}
      </div>
    </div>
  );
}
