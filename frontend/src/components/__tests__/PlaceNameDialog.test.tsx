import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlaceNameDialog from "@/components/PlaceNameDialog";

const mockCreatePlace = vi.fn();

vi.mock("@/lib/api", () => ({
  createPlace: (...args: unknown[]) => mockCreatePlace(...args),
}));

describe("PlaceNameDialog", () => {
  const defaultProps = {
    regionId: "1",
    location: [21.0, 52.0] as [number, number],
    onCreated: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    mockCreatePlace.mockReset();
    defaultProps.onCreated.mockReset();
    defaultProps.onCancel.mockReset();
  });

  it("disables save when name is empty", () => {
    render(<PlaceNameDialog {...defaultProps} />);

    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();
  });

  it("calls createPlace with trimmed name on submit", async () => {
    const user = userEvent.setup();
    const place = { id: 1, name: "Park", location: [21.0, 52.0], created_at: "", updated_at: "" };
    mockCreatePlace.mockResolvedValue(place);
    render(<PlaceNameDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("Place name..."), "  Park  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockCreatePlace).toHaveBeenCalledWith("1", {
        name: "Park",
        location: [21.0, 52.0],
      });
      expect(defaultProps.onCreated).toHaveBeenCalledWith(place);
    });
  });

  it("shows error on API failure", async () => {
    const user = userEvent.setup();
    mockCreatePlace.mockRejectedValue(new Error("Server error"));
    render(<PlaceNameDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("Place name..."), "Test");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("calls onCancel on cancel click", async () => {
    const user = userEvent.setup();
    render(<PlaceNameDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });
});
