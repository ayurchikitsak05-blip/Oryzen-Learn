import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionChat } from "../CompanionChat";
import { activateCompanionStyle, appendCompanionTurn, readCompanionStore } from "@/lib/companion";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

describe("CompanionChat", () => {
  afterEach(() => {
    discardAccountVault();
    window.localStorage.clear();
  });

  it("lets a student name a companion, pick a style, and change it later", async () => {
    await unlockTestVault("student-a");
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
    expect(view.getByTestId("companion-thread").textContent).toMatch(/One clear next step/);
    expect(view.getByTestId("companion-thread").textContent).not.toMatch(/a study companion, not a person/);
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

  it("keeps companion names isolated per student", async () => {
    await unlockTestVault("student-a");
    const first = render(<CompanionChat userId="student-a" />);
    fireEvent.change(first.getByTestId("companion-name"), { target: { value: "Mira" } });
    fireEvent.click(first.getByTestId("companion-save"));
    first.unmount();

    await unlockTestVault("student-b");
    const second = render(<CompanionChat userId="student-b" />);
    expect(second.getByTestId("companion-setup")).toBeTruthy();
    expect(readCompanionStore("student-b").prefs.onboarded).toBe(false);
    await unlockTestVault("student-a");
    expect(readCompanionStore("student-a").prefs.name).toBe("Mira");
  });

  function sendCompanionQuestion(view: ReturnType<typeof render>, question: string) {
    fireEvent.change(view.getByTestId("companion-input"), { target: { value: question } });
    fireEvent.click(view.getByTestId("companion-ask"));
  }

  it("keeps the first message when the signed-in account resolves", async () => {
    await unlockTestVault("student-a");
    activateCompanionStyle("teacher", "student-a");
    appendCompanionTurn(
      {
        id: "earlier-student",
        role: "student",
        text: "Earlier question about joules",
        mocked: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      "student-a"
    );
    const view = render(<CompanionChat userId="local-anonymous" initialStyle="teacher" />);
    sendCompanionQuestion(view, "Explain work and energy");
    expect(view.getByTestId("companion-thread").textContent).toContain("Explain work and energy");

    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    const thread = view.getByTestId("companion-thread").textContent ?? "";
    expect(thread).toContain("Explain work and energy");
    expect(thread).toMatch(/in one sentence|First review/i);
    expect(thread).toContain("Earlier question about joules");
    expect(readCompanionStore("student-a").turns.map((turn) => turn.text)).toEqual(
      expect.arrayContaining(["Earlier question about joules", "Explain work and energy"])
    );
    expect(readCompanionStore("local-anonymous").turns.map((turn) => turn.text)).not.toContain(
      "Explain work and energy"
    );

    view.unmount();
    const reloaded = render(<CompanionChat userId="local-anonymous" initialStyle="teacher" />);
    expect(reloaded.queryByText("Explain work and energy")).toBeNull();
    expect(reloaded.queryByText("Earlier question about joules")).toBeNull();
    reloaded.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    expect(reloaded.getByTestId("companion-thread").textContent).toContain("Explain work and energy");
    expect(reloaded.getByTestId("companion-thread").textContent).toContain("Earlier question about joules");
    reloaded.unmount();
  });

  it("does not move a resolved conversation onto the next account", async () => {
    await unlockTestVault("student-a");
    const view = render(<CompanionChat userId="local-anonymous" initialStyle="teacher" />);
    sendCompanionQuestion(view, "Explain work and energy");
    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    expect(view.getByTestId("companion-thread").textContent).toContain("Explain work and energy");

    await unlockTestVault("student-b");
    view.rerender(<CompanionChat userId="student-b" initialStyle="teacher" />);
    expect(view.queryByText("Explain work and energy")).toBeNull();
    expect(readCompanionStore("student-b").turns.map((turn) => turn.text)).not.toContain(
      "Explain work and energy"
    );

    await unlockTestVault("student-a");
    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    expect(view.getByTestId("companion-thread").textContent).toContain("Explain work and energy");

    view.rerender(<CompanionChat userId="local-anonymous" initialStyle="teacher" />);
    expect(view.queryByText("Explain work and energy")).toBeNull();
    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    expect(view.getByTestId("companion-thread").textContent).toContain("Explain work and energy");
    expect(readCompanionStore("student-a").turns.map((turn) => turn.text)).toContain(
      "Explain work and energy"
    );
  });

  it("keeps the first message visible in a narrow viewport", async () => {
    await unlockTestVault("student-a");
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const view = render(
      <div style={{ width: 390 }}>
        <CompanionChat userId="local-anonymous" initialStyle="teacher" />
      </div>
    );
    sendCompanionQuestion(view, "Explain work and energy");
    view.rerender(
      <div style={{ width: 390 }}>
        <CompanionChat userId="student-a" initialStyle="teacher" />
      </div>
    );
    const thread = view.getByTestId("companion-thread");
    expect(thread.className).toContain("overflow-y-auto");
    expect(thread.textContent).toContain("Explain work and energy");
    expect(view.getByTestId("companion-input")).toBeTruthy();
    expect(view.getByTestId("companion-ask")).toBeTruthy();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });
});
