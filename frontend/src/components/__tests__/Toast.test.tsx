import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

function ToastTrigger({ message }: { message: string }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message)}>Show</button>;
}

describe("ToastProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a toast message when showToast is called", async () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Hello toast" />
      </ToastProvider>,
    );

    await act(async () => {
      screen.getByText("Show").click();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Hello toast");
  });

  it("auto-dismisses the toast after 5 seconds", async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <ToastTrigger message="Bye toast" />
      </ToastProvider>,
    );

    await act(async () => {
      screen.getByText("Show").click();
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
