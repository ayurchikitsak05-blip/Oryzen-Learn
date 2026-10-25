import { beforeEach, describe, expect, it } from "vitest";
import { readReadingSize, writeReadingSize } from "../prefs";

describe("reading size", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.readingSize;
  });

  it("defaults to comfortable and applies a chosen size", () => {
    expect(readReadingSize()).toBe("comfortable");
    expect(writeReadingSize("roomy")).toBe("roomy");
    expect(document.documentElement.dataset.readingSize).toBe("roomy");
    expect(readReadingSize()).toBe("roomy");
  });
});
