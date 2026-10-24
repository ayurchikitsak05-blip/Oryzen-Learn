import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionChat } from "../CompanionChat";
import { readCompanionStore } from "@/lib/companion";

describe("CompanionChat", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("lets a student name a companion, pick a style, and change it later", () => {
    const view = render(<CompanionChat userId="student-a" fromOnboarding />);
    expect(view.getByTestId("companion-setup").textContent).toMatch(/not a person/i);
    fireEvent.change(view.getByTestId("companion-name"), { target: { value: "Mira" } });
    fireEvent.click(view.getByTestId("companion-style-teacher"));
    fireEvent.click(view.getByTestId("companion-character-lamp"));
    fireEvent.click(view.getByTestId("companion-save"));

    expect(view.getByTestId("companion-chat").textContent).toMatch(/Mira/);
    expect(view.getByTestId("companion-mock-notice").textContent).toMatch(/not a live model/i);
    expect(view.getByTestId("companion-continue-hub")).toBeTruthy();
    expect(readCompanionStore("student-a").prefs).toMatchObject({
      name: "Mira",
      style: "teacher",
      character: "lamp",
      onboarded: true,
    });

    fireEvent.click(view.getByTestId("companion-edit"));
    fireEvent.change(view.getByTestId("companion-name"), { target: { value: "Kai" } });
    fireEvent.click(view.getByTestId("companion-style-coach"));
    fireEvent.click(view.getByTestId("companion-save"));
    expect(view.getByTestId("companion-chat").textContent).toMatch(/Kai/);
    expect(readCompanionStore("student-a").prefs.style).toBe("coach");
  });

  it("answers with a mocked, style-aware study draft", () => {
    const view = render(<CompanionChat userId="student-a" />);
    fireEvent.click(view.getByTestId("companion-save"));
    fireEvent.change(view.getByTestId("companion-input"), {
      target: { value: "Plan my session" },
    });
    fireEvent.click(view.getByTestId("companion-ask"));
    expect(view.getByTestId("companion-thread").textContent).toMatch(/StudySprint|15|25|45|60/);
    expect(view.getByTestId("companion-thread").textContent).toMatch(/not a live model/i);
    expect(view.getByTestId("companion-thread").textContent).not.toMatch(/\bI feel\b/);
  });

  it("keeps companion names isolated per student", () => {
    const first = render(<CompanionChat userId="student-a" />);
    fireEvent.change(first.getByTestId("companion-name"), { target: { value: "Mira" } });
    fireEvent.click(first.getByTestId("companion-save"));
    first.unmount();

    const second = render(<CompanionChat userId="student-b" />);
    expect(second.getByTestId("companion-setup")).toBeTruthy();
    expect(readCompanionStore("student-b").prefs.onboarded).toBe(false);
    expect(readCompanionStore("student-a").prefs.name).toBe("Mira");
  });
});
