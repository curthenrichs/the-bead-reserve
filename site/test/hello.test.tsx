import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Hello from "../src/islands/Hello";

describe("toolchain", () => {
  it("renders a React island", () => {
    render(<Hello />);
    expect(screen.getByText("reserve online")).toBeInTheDocument();
  });
});
