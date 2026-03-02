import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RouteComposer from "@/components/RouteComposer";

describe("RouteComposer", () => {
  const defaultProps = {
    isFavorite: true,
    composing: false,
    onStartComposing: vi.fn(),
    onStopComposing: vi.fn(),
    selectedSegmentCount: 0,
    composedTotalDistance: 0,
    composedIsLoop: false,
    onUndoLast: vi.fn(),
    onClearAll: vi.fn(),
    onSaveRoute: vi.fn<(req: unknown) => Promise<void>>().mockResolvedValue(undefined),
    composerError: null as string | null,
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "300px",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows start composing button when not composing", () => {
    render(<RouteComposer {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Start Composing" }),
    ).toBeInTheDocument();
  });

  it("shows stop composing button when composing", () => {
    render(<RouteComposer {...defaultProps} composing={true} />);

    expect(
      screen.getByRole("button", { name: "Stop Composing" }),
    ).toBeInTheDocument();
  });

  it("calls onStartComposing on click", async () => {
    const user = userEvent.setup();
    render(<RouteComposer {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Start Composing" }));
    expect(defaultProps.onStartComposing).toHaveBeenCalledOnce();
  });

  it("calls onStopComposing on click", async () => {
    const user = userEvent.setup();
    render(<RouteComposer {...defaultProps} composing={true} />);

    await user.click(screen.getByRole("button", { name: "Stop Composing" }));
    expect(defaultProps.onStopComposing).toHaveBeenCalledOnce();
  });

  it("displays segment count and distance when composing with segments", () => {
    render(
      <RouteComposer
        {...defaultProps}
        composing={true}
        selectedSegmentCount={5}
        composedTotalDistance={2500}
      />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2.5 km")).toBeInTheDocument();
  });

  it("shows undo and clear buttons when segments selected", () => {
    render(
      <RouteComposer
        {...defaultProps}
        composing={true}
        selectedSegmentCount={3}
        composedTotalDistance={1000}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Undo Last" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear All" }),
    ).toBeInTheDocument();
  });

  it("calls onUndoLast on undo click", async () => {
    const user = userEvent.setup();
    render(
      <RouteComposer
        {...defaultProps}
        composing={true}
        selectedSegmentCount={2}
        composedTotalDistance={500}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo Last" }));
    expect(defaultProps.onUndoLast).toHaveBeenCalledOnce();
  });

  it("calls onClearAll on clear click", async () => {
    const user = userEvent.setup();
    render(
      <RouteComposer
        {...defaultProps}
        composing={true}
        selectedSegmentCount={2}
        composedTotalDistance={500}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(defaultProps.onClearAll).toHaveBeenCalledOnce();
  });

  it("shows save route dialog flow", async () => {
    const user = userEvent.setup();
    render(
      <RouteComposer
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
      expect(defaultProps.onSaveRoute).toHaveBeenCalled();
    });
  });

  it("displays composer error", () => {
    render(
      <RouteComposer
        {...defaultProps}
        composing={true}
        composerError="Segment is not adjacent to the current route."
      />,
    );

    expect(
      screen.getByText("Segment is not adjacent to the current route."),
    ).toBeInTheDocument();
  });

  it("disables start composing when not favorite", () => {
    render(<RouteComposer {...defaultProps} isFavorite={false} />);

    expect(
      screen.getByRole("button", { name: "Start Composing" }),
    ).toBeDisabled();
  });
});
