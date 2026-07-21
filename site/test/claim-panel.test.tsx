import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ClaimPanel from "../src/islands/ClaimPanel";

describe("ClaimPanel (stubbed)", () => {
  it("renders disabled connect + claim with launch copy", () => {
    render(<ClaimPanel />);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /claim/i })).toBeDisabled();
    expect(screen.getByText(/opens at launch/i)).toBeInTheDocument();
  });

  it("shows the genesis distribution total", () => {
    render(<ClaimPanel />);
    expect(screen.getByText(/0 \/ 47,318 claimed/i)).toBeInTheDocument();
  });
});
