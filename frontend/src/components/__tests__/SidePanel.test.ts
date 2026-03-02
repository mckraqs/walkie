import { describe, it, expect } from "vitest";
import { computeSectionHeight } from "@/components/SidePanel";

describe("computeSectionHeight", () => {
  it("returns HEADER when the section itself is collapsed", () => {
    const result = computeSectionHeight(false, false, false, false, false, true);
    expect(result).toBe("2.75rem");
  });

  it("returns HEADER when all sections are collapsed", () => {
    // Even if isCollapsed is false, expandedCount is 0
    const result = computeSectionHeight(true, true, true, true, true, false);
    expect(result).toBe("2.75rem");
  });

  it("gives full height when only one section is expanded", () => {
    // 4 collapsed, 1 expanded
    const result = computeSectionHeight(true, true, true, true, false, false);
    expect(result).toBe("calc((100vh - 8rem - 4 * 2.75rem) / 1)");
  });

  it("splits equally when two sections are expanded", () => {
    // 3 collapsed, 2 expanded
    const result = computeSectionHeight(true, true, true, false, false, false);
    expect(result).toBe("calc((100vh - 8rem - 3 * 2.75rem) / 2)");
  });

  it("splits equally when three sections are expanded", () => {
    // 2 collapsed, 3 expanded
    const result = computeSectionHeight(true, true, false, false, false, false);
    expect(result).toBe("calc((100vh - 8rem - 2 * 2.75rem) / 3)");
  });

  it("splits equally when four sections are expanded", () => {
    // 1 collapsed, 4 expanded
    const result = computeSectionHeight(true, false, false, false, false, false);
    expect(result).toBe("calc((100vh - 8rem - 1 * 2.75rem) / 4)");
  });

  it("splits equally when all sections are expanded", () => {
    // 0 collapsed, 5 expanded
    const result = computeSectionHeight(false, false, false, false, false, false);
    expect(result).toBe("calc((100vh - 8rem - 0 * 2.75rem) / 5)");
  });
});
