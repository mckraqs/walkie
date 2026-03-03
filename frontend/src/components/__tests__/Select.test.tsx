import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

beforeAll(() => {
  // Radix Select calls scrollIntoView which jsdom doesn't implement
  Element.prototype.scrollIntoView = () => {};
  // Radix Select uses pointer capture APIs not available in jsdom
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

describe("SelectContent", () => {
  it("renders with z-[1100] to appear above map and SidePanel layers", () => {
    render(
      <Select open>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>,
    );

    const content = document.querySelector('[data-slot="select-content"]');
    expect(content).not.toBeNull();
    expect(content!.className).toContain("z-[1100]");
  });
});
