// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { mountCameraMonitor } from "../src/scripts/camera-monitor";

const MARKUP = `
  <div data-camera-monitor data-status="dark">
    <span data-cm-badge>○ IDLE</span>
    <img data-cm-mood src="/henry-cro-low-battery.svg" alt="Chief Reserve Officer, on low battery" />
    <span data-cm-mood-caption>Chief Reserve Officer: standing by in the dark</span>
    <div data-cm-screen><span data-cm-placeholder>signal interrupted, reserve remains sealed</span></div>
    <p data-cm-caption></p>
  </div>`;

const fresh = {
  frameUrl: "/api/frame/latest",
  counter: 7,
  ts: 1,
  sha256: null,
  croText: "sealed tight",
  status: "fresh",
};

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

const $ = (sel: string) => document.querySelector(sel);

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("camera monitor island", () => {
  it("a fresh reserve shows the frame, the live badge and the caption", async () => {
    document.body.innerHTML = MARKUP;
    const fetchImpl = vi.fn(() => ok(fresh));
    mountCameraMonitor(document, { pollMs: 0, fetchImpl });

    await vi.waitFor(() => {
      expect($("[data-camera-monitor]")?.getAttribute("data-status")).toBe(
        "fresh",
      );
    });

    const frame = $("[data-cm-screen] img");
    expect(frame?.getAttribute("src")).toBe("/api/frame/latest");
    expect(frame?.getAttribute("alt")).toBe("Camera view of the reserve jar");
    expect(frame?.parentElement?.hasAttribute("data-cm-screen")).toBe(true);
    expect($("[data-cm-placeholder]")).toBeNull();
    expect($("[data-cm-badge]")?.textContent).toBe("● LIVE");

    expect($("[data-cm-caption]")?.textContent).toBe(
      "REC · reserve in view · sealed tight",
    );

    expect($("[data-cm-mood]")?.getAttribute("src")).toBe(
      "/henry-cro-broadcasting.svg",
    );
  });

  it("a failed fetch leaves the dark state and throws nothing", async () => {
    document.body.innerHTML = MARKUP.replace(
      'data-status="dark"',
      'data-status="fresh"',
    );

    const fetchImpl = vi.fn(() => Promise.reject(new Error("network")));
    mountCameraMonitor(document, { pollMs: 0, fetchImpl });

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });

    expect($("[data-camera-monitor]")?.getAttribute("data-status")).toBe(
      "dark",
    );

    expect($("[data-cm-placeholder]")?.textContent).toBe(
      "signal interrupted, reserve remains sealed",
    );
  });

  it("a non-OK answer reads as dark", async () => {
    document.body.innerHTML = MARKUP;

    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve(fresh),
      } as Response),
    );

    mountCameraMonitor(document, { pollMs: 0, fetchImpl });

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });

    expect($("[data-camera-monitor]")?.getAttribute("data-status")).toBe(
      "dark",
    );
  });

  it("goes dark on an outage and recovers on the next good poll; destroy stops polling", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = MARKUP;

    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => ok(fresh))
      .mockImplementationOnce(() => Promise.reject(new Error("down")))
      .mockImplementation(() => ok(fresh));

    const handle = mountCameraMonitor(document, { pollMs: 1000, fetchImpl });

    const status = () =>
      $("[data-camera-monitor]")?.getAttribute("data-status");

    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe("fresh");
    await vi.advanceTimersByTimeAsync(1000);
    expect(status()).toBe("dark");
    await vi.advanceTimersByTimeAsync(1000);
    expect(status()).toBe("fresh");

    handle.destroy();
    const calls = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it("does nothing on a page without the monitor", () => {
    document.body.innerHTML = "<p>no monitor</p>";
    const fetchImpl = vi.fn(() => ok(fresh));
    mountCameraMonitor(document, { pollMs: 0, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
