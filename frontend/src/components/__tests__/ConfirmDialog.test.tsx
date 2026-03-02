import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "@/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaultProps = {
    title: "Delete route?",
    message: "This action cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders title, message, and button labels", () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText("Delete route?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  it("renders destructive variant confirm button", () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    expect(confirmBtn).toBeInTheDocument();
  });

  it("renders default variant confirm button", () => {
    render(<ConfirmDialog {...defaultProps} variant="default" />);

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    expect(confirmBtn).toBeInTheDocument();
  });
});
