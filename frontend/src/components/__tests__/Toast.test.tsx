import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

function ToastTrigger({ message }: { message: string }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message)}>Show</button>;
}

describe("ToastProvider", () => {
  it("calls sonner toast when showToast is called", async () => {
    const { toast } = await import("sonner");

    render(
      <ToastProvider>
        <ToastTrigger message="Hello toast" />
      </ToastProvider>,
    );

    await act(async () => {
      screen.getByText("Show").click();
    });

    expect(toast).toHaveBeenCalledWith("Hello toast");
  });
});
