import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PathList from "@/components/PathList";
import { makePathFeature } from "@/test/helpers";

describe("PathList", () => {
  const defaultProps = {
    paths: [
      makePathFeature({ id: 1, properties: { name: "Main Street", category: "footway", surface: "asphalt", accessible: true, is_lit: false, created_at: "" } }),
      makePathFeature({ id: 2, properties: { name: "Oak Avenue", category: "cycleway", surface: "gravel", accessible: true, is_lit: true, created_at: "" } }),
    ],
    walkedPathIds: new Set([1]),
    hoveredPathId: null,
    onPathHover: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "300px",
  };

  it("renders all paths", () => {
    render(<PathList {...defaultProps} />);

    expect(screen.getByText("Main Street")).toBeInTheDocument();
    expect(screen.getByText("Oak Avenue")).toBeInTheDocument();
  });

  it("shows empty message when no paths to display", () => {
    render(<PathList {...defaultProps} paths={[]} />);

    expect(screen.getByText("No paths to display.")).toBeInTheDocument();
  });

  it("calls onPathHover on mouse enter/leave", async () => {
    const user = userEvent.setup();
    const onPathHover = vi.fn();
    render(<PathList {...defaultProps} onPathHover={onPathHover} />);

    const item = screen.getByText("Main Street").closest("li")!;
    await user.hover(item);
    expect(onPathHover).toHaveBeenCalledWith(1);

    await user.unhover(item);
    expect(onPathHover).toHaveBeenCalledWith(null);
  });

  it("toggles collapse on header click", async () => {
    const user = userEvent.setup();
    const onToggleCollapsed = vi.fn();
    render(<PathList {...defaultProps} onToggleCollapsed={onToggleCollapsed} />);

    await user.click(screen.getByText("Paths List"));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });
});
