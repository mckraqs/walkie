import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoutePlanner from "@/components/RoutePlanner";
import { makeRouteResponse, makePlace } from "@/test/helpers";

vi.mock("@/lib/gpx", () => ({
  downloadRouteFile: vi.fn(),
}));

describe("RoutePlanner", () => {
  const defaultProps = {
    route: null as ReturnType<typeof makeRouteResponse> | null,
    loading: false,
    error: null as string | null,
    onGenerate: vi.fn(),
    onClear: vi.fn(),
    isFavorite: true,
    places: [makePlace({ id: 1, name: "Home" }), makePlace({ id: 2, name: "Park" })],
    onSaveRoute: vi.fn<(req: unknown) => Promise<void>>().mockResolvedValue(undefined),
    activeRouteId: null as number | null,
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "400px",
    startTempPoint: null,
    endTempPoint: null,
    onPickPointOnMap: vi.fn(),
    onClearTempPoint: vi.fn(),
    autoSelectPlace: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders distance input with correct range", () => {
    render(<RoutePlanner {...defaultProps} />);

    const input = screen.getByLabelText("Distance (km)");
    expect(input).toHaveAttribute("min", "0.1");
    expect(input).toHaveAttribute("max", "50");
  });

  it("hides end place select on loop mode", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    // Initially end-place should be visible (one_way by default)
    expect(screen.getByLabelText("Finish place")).toBeInTheDocument();

    // Toggle to loop
    await user.click(screen.getByLabelText("Loop route"));

    expect(screen.queryByLabelText("Finish place")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Start / Finish place")).toBeInTheDocument();
  });

  it("calls onGenerate with correct args on submit", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    const input = screen.getByLabelText("Distance (km)");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "Plan" }));

    expect(defaultProps.onGenerate).toHaveBeenCalledWith(
      5,
      "one_way",
      null,
      null,
      null,
      null,
    );
  });

  it("shows save route dialog flow", async () => {
    const user = userEvent.setup();
    const route = makeRouteResponse();
    render(<RoutePlanner {...defaultProps} route={route} />);

    await user.click(screen.getByRole("button", { name: "Save Route" }));

    expect(screen.getByPlaceholderText("Route name")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Route name");
    await user.clear(nameInput);
    await user.type(nameInput, "My Walk");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(defaultProps.onSaveRoute).toHaveBeenCalled();
    });
  });

  it("disables plan button when not favorite", () => {
    render(<RoutePlanner {...defaultProps} isFavorite={false} />);

    expect(screen.getByRole("button", { name: "Plan" })).toBeDisabled();
  });

  it("shows add region message when not favorite", () => {
    render(<RoutePlanner {...defaultProps} isFavorite={false} />);

    expect(
      screen.getByText("Add this region to your favorites to generate routes."),
    ).toBeInTheDocument();
  });

  it("displays error message", () => {
    render(<RoutePlanner {...defaultProps} error="Something went wrong" />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
