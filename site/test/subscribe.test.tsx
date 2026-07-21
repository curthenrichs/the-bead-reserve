import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import Subscribe from "../src/islands/Subscribe";

afterEach(() => vi.unstubAllGlobals());

describe("Subscribe", () => {
  it("valid email -> confirmation, no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<Subscribe />);
    await userEvent.type(screen.getByLabelText(/email/i), "you@somewhere.tld");
    await userEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    expect(screen.getByText(/enrolled as correspondent/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("invalid email -> error message", async () => {
    render(<Subscribe />);
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    expect(screen.getByText(/does not look deliverable/i)).toBeInTheDocument();
  });
});
