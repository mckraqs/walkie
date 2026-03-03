import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Places from "@/components/Places";
import type { Place } from "@/types/geo";

const mockPlaces: Place[] = [
  { id: 1, name: "Home", location: [20.0, 50.0], created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: 2, name: "Office", location: [20.1, 50.1], created_at: "2025-01-02T00:00:00Z", updated_at: "2025-01-02T00:00:00Z" },
];

function defaultProps(overrides: Partial<Parameters<typeof Places>[0]> = {}) {
  return {
    places: mockPlaces,
    placeCreationMode: null as "pin" | "search" | null,
    onSetPlaceCreationMode: vi.fn(),
    onDeletePlace: vi.fn().mockResolvedValue(undefined),
    onRenamePlace: vi.fn().mockResolvedValue(undefined),
    onPlaceClick: vi.fn(),
    hoveredPlaceId: null,
    onPlaceHover: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "300px",
    regionBbox: null as [number, number, number, number] | null,
    regionCenter: null as [number, number] | null,
    onSearchResultHover: vi.fn(),
    onSearchResultSelect: vi.fn(),
    onSaveSearchResult: vi.fn(),
    ...overrides,
  };
}

describe("Places", () => {
  it("renders the header with title", () => {
    render(<Places {...defaultProps()} />);
    expect(screen.getByText("My Places")).toBeInTheDocument();
  });

  it("displays place count badge when places exist", () => {
    render(<Places {...defaultProps()} />);
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("does not display count badge when no places", () => {
    render(<Places {...defaultProps({ places: [] })} />);
    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });

  it("calls onToggleCollapsed when header is clicked", () => {
    const onToggleCollapsed = vi.fn();
    render(<Places {...defaultProps({ onToggleCollapsed })} />);
    fireEvent.click(screen.getByText("My Places"));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("shows '+ Place' button when placeCreationMode is null", () => {
    render(<Places {...defaultProps({ placeCreationMode: null })} />);
    expect(screen.getByText("+ Place")).toBeInTheDocument();
  });

  it("clicking '+ Place' shows creation options", () => {
    render(<Places {...defaultProps()} />);
    fireEvent.click(screen.getByText("+ Place"));
    expect(screen.getByText("Pin on Map")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows pin hint and cancel when placeCreationMode is 'pin'", () => {
    render(<Places {...defaultProps({ placeCreationMode: "pin" })} />);
    expect(screen.getByText("Click on the map to place a pin")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("clicking cancel in pin mode calls onSetPlaceCreationMode(null)", () => {
    const onSetPlaceCreationMode = vi.fn();
    render(<Places {...defaultProps({ placeCreationMode: "pin", onSetPlaceCreationMode })} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onSetPlaceCreationMode).toHaveBeenCalledWith(null);
  });

  it("renders place list with names", () => {
    render(<Places {...defaultProps()} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Office")).toBeInTheDocument();
  });

  it("calls onPlaceClick when a place row is clicked", () => {
    const onPlaceClick = vi.fn();
    render(<Places {...defaultProps({ onPlaceClick })} />);
    fireEvent.click(screen.getByText("Home"));
    expect(onPlaceClick).toHaveBeenCalledWith([20.0, 50.0]);
  });

  it("calls onDeletePlace via dropdown menu", async () => {
    const user = userEvent.setup();
    const onDeletePlace = vi.fn().mockResolvedValue(undefined);
    render(<Places {...defaultProps({ onDeletePlace })} />);
    // Open dropdown for first place
    const actionButtons = screen.getAllByTitle("Actions");
    await user.click(actionButtons[0]);
    // Click Delete in dropdown
    const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
    await user.click(deleteItem);
    expect(onDeletePlace).toHaveBeenCalledWith(1);
  });

  it("inline rename flow works", async () => {
    const user = userEvent.setup();
    const onRenamePlace = vi.fn().mockResolvedValue(undefined);
    render(<Places {...defaultProps({ onRenamePlace })} />);
    // Open dropdown for first place
    const actionButtons = screen.getAllByTitle("Actions");
    await user.click(actionButtons[0]);
    // Click Rename
    const renameItem = await screen.findByRole("menuitem", { name: "Rename" });
    await user.click(renameItem);
    // Should show input with current name
    const input = screen.getByDisplayValue("Home");
    expect(input).toBeInTheDocument();
    // Change name and confirm
    await user.clear(input);
    await user.type(input, "My House");
    await user.click(screen.getByTitle("Confirm"));
    await waitFor(() => {
      expect(onRenamePlace).toHaveBeenCalledWith(1, "My House");
    });
  });

  it("shows empty state when no places", () => {
    render(<Places {...defaultProps({ places: [] })} />);
    expect(screen.getByText("No places yet.")).toBeInTheDocument();
  });

  it("creation option buttons call onSetPlaceCreationMode", () => {
    const onSetPlaceCreationMode = vi.fn();
    render(<Places {...defaultProps({ onSetPlaceCreationMode })} />);
    // Show creation options
    fireEvent.click(screen.getByText("+ Place"));
    // Click Pin on Map
    fireEvent.click(screen.getByText("Pin on Map"));
    expect(onSetPlaceCreationMode).toHaveBeenCalledWith("pin");
  });
});
