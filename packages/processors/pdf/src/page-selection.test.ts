import { describe, expect, it } from "vitest";
import { parsePageSelection } from "./page-selection";

describe("parsePageSelection", () => {
  it("parses single pages and inclusive ranges in the requested order", () => {
    expect(parsePageSelection("3, 1-2", 4)).toEqual([3, 1, 2]);
  });

  it.each(["", "1,,2", "0", "1-5", "4-2", "1, 1", "two"])(
    "rejects invalid page selection %j",
    (selection) => {
      expect(() => parsePageSelection(selection, 4)).toThrow();
    },
  );

  it("limits the selected page count", () => {
    expect(() => parsePageSelection("1-2001", 3000)).toThrow("2,000 pages");
  });
});
