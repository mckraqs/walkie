import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SavedRoutes from "@/components/SavedRoutes";
import { makeRouteListItem, makeRouteResponse } from "@/test/helpers";

vi.mock("@/lib/gpx", () => ({
  downloadRouteFile: vi.fn(),
}));

describe("SavedRoutes", () => {
  const defaultProps = {
    savedRoutes: [
      makeRouteListItem({ id: 1, name: "Morning Walk", total_distance: 3500, is_loop: true }),
      makeRouteListItem({ id: 2, name: "Evening Run", total_distance: 800, is_custom: true }),
    ],
    activeRouteId: null as number | null,
    loadedRouteDetails: null as ReturnType<typeof makeRouteResponse> | null,
    loading: false,
    onLoadRoute: vi.fn(),
    onDeleteRoute: vi.fn<(routeId: number) => Promise<void>>().mockResolvedValue(undefined),
    onRenameRoute: vi.fn<(routeId: number, name: string) => Promise<void>>().mockResolvedValue(undefined),
    onClearLoadedRoute: vi.fn(),
    onRouteHover: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "300px",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders route list with names and distances", () => {
    render(<SavedRoutes {...defaultProps} />);

    expect(screen.getByText("Morning Walk")).toBeInTheDocument();
    expect(screen.getByText("3.5 km")).toBeInTheDocument();
    expect(screen.getByText("Evening Run")).toBeInTheDocument();
    expect(screen.getByText("800 m")).toBeInTheDocument();
  });

  it("shows Loop badge for loop routes", () => {
    render(<SavedRoutes {...defaultProps} />);

    expect(screen.getByText("Loop")).toBeInTheDocument();
  });

  it("loads route on click", async () => {
    const user = userEvent.setup();
    render(<SavedRoutes {...defaultProps} />);

    await user.click(screen.getByText("Morning Walk"));
    expect(defaultProps.onLoadRoute).toHaveBeenCalledWith(1);
  });

  it("unloads route on click when already active", async () => {
    const user = userEvent.setup();
    render(<SavedRoutes {...defaultProps} activeRouteId={1} />);

    await user.click(screen.getByText("Morning Walk"));
    expect(defaultProps.onClearLoadedRoute).toHaveBeenCalled();
  });

  it("enters rename mode and confirms with Enter", async () => {
    const user = userEvent.setup();
    render(<SavedRoutes {...defaultProps} />);

    const actionsButtons = screen.getAllByTitle("Actions");
    await user.click(actionsButtons[0]);
    await user.click(screen.getByText("Rename"));

    const input = screen.getByDisplayValue("Morning Walk");
    await user.clear(input);
    await user.type(input, "New Name{Enter}");

    await waitFor(() => {
      expect(defaultProps.onRenameRoute).toHaveBeenCalledWith(1, "New Name");
    });
  });

  it("cancels rename with Escape", async () => {
    const user = userEvent.setup();
    render(<SavedRoutes {...defaultProps} />);

    const actionsButtons = screen.getAllByTitle("Actions");
    await user.click(actionsButtons[0]);
    await user.click(screen.getByText("Rename"));

    const input = screen.getByDisplayValue("Morning Walk");
    await user.keyboard("{Escape}");

    expect(input).not.toBeInTheDocument();
    expect(defaultProps.onRenameRoute).not.toHaveBeenCalled();
  });

  it("deletes route on delete button click", async () => {
    const user = userEvent.setup();
    render(<SavedRoutes {...defaultProps} />);

    const actionsButtons = screen.getAllByTitle("Actions");
    await user.click(actionsButtons[0]);
    await user.click(screen.getByText("Delete"));

    expect(defaultProps.onDeleteRoute).toHaveBeenCalledWith(1);
  });

  it("shows empty message when no routes", () => {
    render(<SavedRoutes {...defaultProps} savedRoutes={[]} />);

    expect(screen.getByText("No saved routes yet.")).toBeInTheDocument();
  });
});
