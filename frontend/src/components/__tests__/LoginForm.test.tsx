import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "@/components/LoginForm";

const mockLogin = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it("renders username and password inputs and submit button", () => {
    render(<LoginForm />);

    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("calls login on form submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Username"), "testuser");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(mockLogin).toHaveBeenCalledWith({
      username: "testuser",
      password: "secret",
    });
  });

  it("shows error message on login rejection", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error("Invalid credentials."));
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Username"), "bad");
    await user.type(screen.getByPlaceholderText("Password"), "bad");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials.")).toBeInTheDocument();
    });
  });

  it("disables button while submitting", async () => {
    const user = userEvent.setup();
    let resolveLogin: () => void;
    mockLogin.mockImplementation(
      () => new Promise<void>((resolve) => { resolveLogin = resolve; }),
    );
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Username"), "u");
    await user.type(screen.getByPlaceholderText("Password"), "p");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("button", { name: "Logging in..." })).toBeDisabled();

    resolveLogin!();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
    });
  });
});
