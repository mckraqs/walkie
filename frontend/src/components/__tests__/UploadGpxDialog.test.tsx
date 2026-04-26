import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadGpxDialog from "@/components/UploadGpxDialog";

// Mock gpx module
vi.mock("@/lib/gpx", () => ({
  parseAndSimplifyGpx: vi.fn(),
}));

import { parseAndSimplifyGpx } from "@/lib/gpx";

const mockParseAndSimplifyGpx = vi.mocked(parseAndSimplifyGpx);

function makeGpxFile(content: string = "<gpx></gpx>"): File {
  return new File([content], "walk.gpx", { type: "application/gpx+xml" });
}

describe("UploadGpxDialog", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog with all fields", () => {
    render(<UploadGpxDialog {...defaultProps} />);
    expect(screen.getByText("Upload GPX Walk")).toBeInTheDocument();
    expect(screen.getByLabelText("GPX File")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByText("Create Walk")).toBeInTheDocument();
  });

  it("disables submit when no file loaded", () => {
    render(<UploadGpxDialog {...defaultProps} />);
    const submit = screen.getByText("Create Walk");
    expect(submit).toBeDisabled();
  });

  it("disables submit when file loaded but name is empty", async () => {
    mockParseAndSimplifyGpx.mockReturnValue({
      raw: 100,
      simplified: 50,
      coordinates: [[21.0, 52.0], [21.1, 52.1]],
    });

    render(<UploadGpxDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText("GPX File");
    fireEvent.change(fileInput, { target: { files: [makeGpxFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/100 points loaded/)).toBeInTheDocument();
    });

    const submit = screen.getByText("Create Walk");
    expect(submit).toBeDisabled();
  });

  it("shows confirmation line after successful parse", async () => {
    mockParseAndSimplifyGpx.mockReturnValue({
      raw: 2665,
      simplified: 312,
      coordinates: [[21.0, 52.0], [21.1, 52.1]],
    });

    render(<UploadGpxDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText("GPX File");
    fireEvent.change(fileInput, { target: { files: [makeGpxFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/2,665 points loaded \(simplified to 312\)/)).toBeInTheDocument();
    });
  });

  it("shows error on parse failure", async () => {
    mockParseAndSimplifyGpx.mockImplementation(() => {
      throw new Error("No trackpoints found in GPX file.");
    });

    render(<UploadGpxDialog {...defaultProps} />);
    const fileInput = screen.getByLabelText("GPX File");
    fireEvent.change(fileInput, { target: { files: [makeGpxFile()] } });

    await waitFor(() => {
      expect(screen.getByText("No trackpoints found in GPX file.")).toBeInTheDocument();
    });
  });

  it("submits correct data when form is complete", async () => {
    const coords: [number, number][] = [[21.0, 52.0], [21.1, 52.1]];
    mockParseAndSimplifyGpx.mockReturnValue({
      raw: 100,
      simplified: 50,
      coordinates: coords,
    });

    const onSubmit = vi.fn();
    render(<UploadGpxDialog {...defaultProps} onSubmit={onSubmit} />);

    const fileInput = screen.getByLabelText("GPX File");
    fireEvent.change(fileInput, { target: { files: [makeGpxFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/100 points loaded/)).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Morning Walk" } });

    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-03-19" } });

    const submit = screen.getByText("Create Walk");
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Morning Walk",
      walked_at: "2026-03-19",
      geometry: { type: "LineString", coordinates: coords },
    });
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    render(<UploadGpxDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
