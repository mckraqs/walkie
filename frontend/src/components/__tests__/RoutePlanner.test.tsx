import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoutePlanner from "@/components/RoutePlanner";
import { makeRouteResponse, makePlace } from "@/test/helpers";

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
    composing: false,
    onStartComposing: vi.fn(),
    onStopComposing: vi.fn(),
    selectedSegmentCount: 0,
    composedTotalDistance: 0,
    composedIsLoop: false,
    onUndoLastSegment: vi.fn(),
    onClearAllSegments: vi.fn(),
    onSaveComposedRoute: vi.fn<(req: unknown) => Promise<void>>().mockResolvedValue(undefined),
    composerError: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Compose tab active by default with Start Composing button", () => {
    render(<RoutePlanner {...defaultProps} />);

    expect(screen.getByRole("tab", { name: "Compose" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Generate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Composing" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Distance (km)")).not.toBeInTheDocument();
  });

  it("switches to Generate tab and shows form", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    expect(screen.getByLabelText("Distance (km)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Composing" })).not.toBeInTheDocument();
  });

  it("switches back to Compose tab from Generate", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));
    await user.click(screen.getByRole("tab", { name: "Compose" }));

    expect(screen.getByRole("button", { name: "Start Composing" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Distance (km)")).not.toBeInTheDocument();
  });

  it("renders distance input with correct range", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    const input = screen.getByLabelText("Distance (km)");
    expect(input).toHaveAttribute("min", "0.1");
    expect(input).toHaveAttribute("max", "50");
  });

  it("hides end place select on loop mode", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    // Initially "Finish place" label should be visible (one_way by default)
    expect(screen.getByText("Finish place")).toBeInTheDocument();

    // Toggle to loop
    await user.click(screen.getByText("Loop route"));

    expect(screen.queryByText("Finish place")).not.toBeInTheDocument();
    expect(screen.getByText("Start / Finish place")).toBeInTheDocument();
  });

  it("calls onGenerate with correct args on submit", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

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

    await user.click(screen.getByRole("tab", { name: "Generate" }));
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

  it("disables plan button when not favorite", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} isFavorite={false} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    expect(screen.getByRole("button", { name: "Plan" })).toBeDisabled();
  });

  it("shows add region message when not favorite", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} isFavorite={false} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    expect(
      screen.getByText("Add this region to your favorites to generate routes."),
    ).toBeInTheDocument();
  });

  it("displays error message on generate tab", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} error="Something went wrong" />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("disables Start Composing when not favorite", () => {
    render(<RoutePlanner {...defaultProps} isFavorite={false} />);

    expect(screen.getByRole("button", { name: "Start Composing" })).toBeDisabled();
  });

  it("calls onStartComposing when clicking Start Composing", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Start Composing" }));
    expect(defaultProps.onStartComposing).toHaveBeenCalledOnce();
  });

  it("shows composing mode UI when composing", () => {
    render(
      <RoutePlanner
        {...defaultProps}
        composing={true}
        selectedSegmentCount={5}
        composedTotalDistance={2500}
      />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2.5 km")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo Last" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onStopComposing when clicking Cancel in composing mode", async () => {
    const user = userEvent.setup();
    render(<RoutePlanner {...defaultProps} composing={true} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onStopComposing).toHaveBeenCalledOnce();
  });

  it("calls onUndoLastSegment on undo click", async () => {
    const user = userEvent.setup();
    render(
      <RoutePlanner
        {...defaultProps}
        composing={true}
        selectedSegmentCount={2}
        composedTotalDistance={500}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo Last" }));
    expect(defaultProps.onUndoLastSegment).toHaveBeenCalledOnce();
  });

  it("calls onClearAllSegments on clear click", async () => {
    const user = userEvent.setup();
    render(
      <RoutePlanner
        {...defaultProps}
        composing={true}
        selectedSegmentCount={2}
        composedTotalDistance={500}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(defaultProps.onClearAllSegments).toHaveBeenCalledOnce();
  });

  it("shows composer save route dialog flow", async () => {
    const user = userEvent.setup();
    render(
      <RoutePlanner
        {...defaultProps}
        composing={true}
        selectedSegmentCount={3}
        composedTotalDistance={2000}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Route" }));

    expect(screen.getByPlaceholderText("Route name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Custom Route")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Route name");
    await user.clear(nameInput);
    await user.type(nameInput, "My Custom Route");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(defaultProps.onSaveComposedRoute).toHaveBeenCalled();
    });
  });

  it("displays composer error", () => {
    render(
      <RoutePlanner
        {...defaultProps}
        composing={true}
        composerError="Segment is not adjacent to the current route."
      />,
    );

    expect(
      screen.getByText("Segment is not adjacent to the current route."),
    ).toBeInTheDocument();
  });

  it("shows route details inline on Generate tab alongside form", async () => {
    const user = userEvent.setup();
    const route = makeRouteResponse();
    render(<RoutePlanner {...defaultProps} route={route} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    // Form is still visible
    expect(screen.getByLabelText("Distance (km)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();

    // Route details are shown inline
    expect(screen.getByText("3.0 km")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Main Street")).toBeInTheDocument();
    expect(screen.getByText("Oak Avenue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Route" })).toBeInTheDocument();
  });

  it("calls onClear when clicking Clear Route on Generate tab", async () => {
    const user = userEvent.setup();
    const route = makeRouteResponse();
    render(<RoutePlanner {...defaultProps} route={route} />);

    await user.click(screen.getByRole("tab", { name: "Generate" }));

    await user.click(screen.getByRole("button", { name: "Clear Route" }));
    expect(defaultProps.onClear).toHaveBeenCalledOnce();
  });
});
