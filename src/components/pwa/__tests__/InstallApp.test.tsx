import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallApp } from "../InstallApp";
import { setDeferredInstall, type InstallEvent } from "@/lib/pwa/install";

afterEach(() => {
  cleanup();
  setDeferredInstall(null);
  window.localStorage.clear();
});

describe("Install Oryzen as an app", () => {
  it("stays hidden when the browser can't install", () => {
    render(<InstallApp />);
    expect(screen.queryByTestId("install-app")).toBeNull();
  });

  it("shows Install once Chrome offers it and opens the browser's prompt", async () => {
    render(<InstallApp dismissible />);
    const prompt = vi.fn(async () => undefined);
    act(() => setDeferredInstall({ prompt, userChoice: Promise.resolve({ outcome: "accepted" }) } as unknown as InstallEvent));
    fireEvent.click(await screen.findByTestId("install-app-button"));
    expect(prompt).toHaveBeenCalled();
  });

  it("can be hidden for good on Today", async () => {
    setDeferredInstall({ prompt: vi.fn(), userChoice: new Promise(() => undefined) } as unknown as InstallEvent);
    const { unmount } = render(<InstallApp dismissible />);
    fireEvent.click(await screen.findByTestId("install-app-dismiss"));
    expect(screen.queryByTestId("install-app")).toBeNull();
    unmount();
    render(<InstallApp dismissible />);
    expect(screen.queryByTestId("install-app")).toBeNull();
  });
});
