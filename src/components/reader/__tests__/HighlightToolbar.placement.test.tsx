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
    const readTop = () => Number.parseFloat(toolbar.style.top);
    const missesBand = (pageTop: number, pageHeight: number) => {
      const top = readTop();
      const band = firstLineHeightForPage(pageHeight);
      return top + 44 <= pageTop || top >= pageTop + band - 1;
    };
    expect(missesBand(180, 800)).toBe(true);

    box = rect(30, 800);
    fireEvent.scroll(host);
    expect(missesBand(30, 800)).toBe(true);

    box = rect(180, 1500);
    fireEvent.scroll(window);
    expect(missesBand(180, 1500)).toBe(true);

    const heading = document.createElement("span");
    heading.setAttribute("data-testid", "pdf-text-run");
    heading.textContent = "CHAPTER 6 WORK AND ENERGY";
    page.appendChild(heading);
    heading.getBoundingClientRect = () => rect(280, 80, 640);
    const body = document.createElement("span");
    body.setAttribute("data-testid", "pdf-text-run");
    body.textContent = "In physics, work is done only when a force moves an object.";
    page.appendChild(body);
    body.getBoundingClientRect = () => rect(372, 28, 700);
    fireEvent.scroll(host);
    const aboveHeading = readTop();
    expect(aboveHeading + 80).toBeLessThanOrEqual(280);
  });
});
