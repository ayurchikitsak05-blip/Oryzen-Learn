import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstLineHeightForPage } from "@/lib/reader/highlight-toolbar";
import HighlightToolbar from "../HighlightToolbar";

function rect(top: number, height: number, width = 640) {
  return {
    x: 32,
    y: top,
    top,
    left: 32,
    width,
    height,
    right: 32 + width,
    bottom: top + height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe("highlight toolbar placement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("stays below the first line on desktop, after scroll, and after zoom", () => {
    const host = document.createElement("div");
    host.setAttribute("data-testid", "pdf-scroll-host");
    const page = document.createElement("div");
    page.setAttribute("data-active", "true");
    host.appendChild(page);
    document.body.appendChild(host);
    let box = rect(180, 800);
    page.getBoundingClientRect = () => box;

    const view = render(
      <HighlightToolbar
        selectedText="Work is force times distance."
        pageNumber={1}
        sectionHeading="Work and energy"
        activeLens={null}
        loading={false}
        onSelectLens={() => undefined}
        top={192}
        left={220}
      />
    );
    const toolbar = view.getByTestId("multi-lens-highlight-toolbar");
    const firstTop = Number.parseFloat(toolbar.style.top);
    expect(firstTop).toBeGreaterThanOrEqual(180 + firstLineHeightForPage(800));

    box = rect(30, 800);
    fireEvent.scroll(host);
    const scrolledTop = Number.parseFloat(toolbar.style.top);
    expect(scrolledTop).toBeGreaterThanOrEqual(30 + firstLineHeightForPage(800));

    box = rect(180, 1500);
    fireEvent.scroll(window);
    const zoomedTop = Number.parseFloat(toolbar.style.top);
    expect(zoomedTop).toBeGreaterThanOrEqual(180 + firstLineHeightForPage(1500));
  });
});
