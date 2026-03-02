import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Places from "@/components/Places";
import type { Place } from "@/types/geo";

const mockPlaces: Place[] = [
  { id: 1, name: "Home", location: [20.0, 50.0], created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: 2, name: "Office", location: [20.1, 50.1], created_at: "2025-01-02T00:00:00Z", updated_at: "2025-01-02T00:00:00Z" },
];

function defaultProps(overrides: Partial<Parameters<typeof Places>[0]> = {}) {
  return {
    places: mockPlaces,
    showPlaces: false,
    onToggleShowPlaces: vi.fn(),
    isCreatingPlace: false,
    onToggleCreatingPlace: vi.fn(),
    onDeletePlace: vi.fn().mockResolvedValue(undefined),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    height: "300px",
    ...overrides,
  };
}

describe("Places", () => {
  it("renders the header with title", () => {
    render(<Places {...defaultProps()} />);
    expect(screen.getByText("Places")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Places"));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("renders show-on-map checkbox", () => {
    render(<Places {...defaultProps({ showPlaces: true })} />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("calls onToggleShowPlaces when checkbox is toggled", () => {
    const onToggleShowPlaces = vi.fn();
    render(<Places {...defaultProps({ onToggleShowPlaces })} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleShowPlaces).toHaveBeenCalledOnce();
  });

  it("shows '+ Place' button when not creating", () => {
    render(<Places {...defaultProps({ isCreatingPlace: false })} />);
    expect(screen.getByText("+ Place")).toBeInTheDocument();
  });

  it("shows 'Cancel Pin' button when creating", () => {
    render(<Places {...defaultProps({ isCreatingPlace: true })} />);
    expect(screen.getByText("Cancel Pin")).toBeInTheDocument();
  });

  it("calls onToggleCreatingPlace when button is clicked", () => {
    const onToggleCreatingPlace = vi.fn();
    render(<Places {...defaultProps({ onToggleCreatingPlace })} />);
    fireEvent.click(screen.getByText("+ Place"));
    expect(onToggleCreatingPlace).toHaveBeenCalledOnce();
  });

  it("renders place list with names", () => {
    render(<Places {...defaultProps()} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Office")).toBeInTheDocument();
  });

  it("calls onDeletePlace when delete button is clicked", () => {
    const onDeletePlace = vi.fn().mockResolvedValue(undefined);
    render(<Places {...defaultProps({ onDeletePlace })} />);
    const deleteButtons = screen.getAllByTitle("Delete");
    fireEvent.click(deleteButtons[0]);
    expect(onDeletePlace).toHaveBeenCalledWith(1);
  });

  it("shows empty state when no places", () => {
    render(<Places {...defaultProps({ places: [] })} />);
    expect(screen.getByText("No places yet.")).toBeInTheDocument();
  });
});
