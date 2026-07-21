import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import CameraMonitor from "../src/islands/CameraMonitor";

function mockReserve(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok, json: async () => body,
  }));
}
afterEach(() => vi.unstubAllGlobals());

const fresh = { frameUrl: "/api/frame/latest", counter: 7, ts: Math.floor(Date.now()/1000),
  sha256: "ab".repeat(32), sig: "cd".repeat(64), croText: "the reserve remains sealed",
  status: "fresh", apiVersion: "0.1.0" };

describe("CameraMonitor", () => {
  it("fresh: shows the frame, REC, and croText", async () => {
    mockReserve(fresh);
    render(<CameraMonitor pollMs={0} />);
    await waitFor(() => expect(screen.getByText(/rec/i)).toBeInTheDocument());
    expect(screen.getByRole("img", { name: /reserve/i })).toHaveAttribute("src", "/api/frame/latest");
    expect(screen.getByText(/the reserve remains sealed/i)).toBeInTheDocument();
  });

  it("stale: shows a delayed notice", async () => {
    mockReserve({ ...fresh, status: "stale" });
    render(<CameraMonitor pollMs={0} />);
    await waitFor(() => expect(screen.getByText(/signal delayed/i)).toBeInTheDocument());
  });

  it("dark: shows the sealed notice, no frame", async () => {
    mockReserve({ ...fresh, status: "dark" });
    render(<CameraMonitor pollMs={0} />);
    await waitFor(() => expect(screen.getByText(/reserve remains sealed/i)).toBeInTheDocument());
    expect(screen.queryByRole("img", { name: /reserve/i })).toBeNull();
  });

  it("empty state (nulls, status dark) is treated as dark, not an error", async () => {
    mockReserve({ frameUrl: null, counter: null, ts: null, sha256: null, sig: null,
      croText: null, status: "dark", apiVersion: "0.1.0" });
    render(<CameraMonitor pollMs={0} />);
    await waitFor(() => expect(screen.getByText(/reserve remains sealed/i)).toBeInTheDocument());
  });

  it("fetch failure degrades to dark, no unhandled error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<CameraMonitor pollMs={0} />);
    await waitFor(() => expect(screen.getByText(/reserve remains sealed/i)).toBeInTheDocument());
  });
});
