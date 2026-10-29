import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionChat } from "../CompanionChat";
import { activateCompanionStyle, appendCompanionTurn, readCompanionStore } from "@/lib/companion";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

const replyProbe = vi.hoisted(() => ({
  duringReply: null as null | (() => void),
}));

vi.mock("@/lib/companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/companion")>();
  return {
    ...actual,
    companionReply: (input: Parameters<typeof actual.companionReply>[0]) => {
      const nested = replyProbe.duringReply;
      replyProbe.duringReply = null;
      nested?.();
      return actual.companionReply(input);
    },
  };
});

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
    fireEvent.change(view.getByTestId("companion-name"), { target: { value: "Dev" } });
    fireEvent.click(view.getByTestId("companion-style-coach"));
    fireEvent.click(view.getByTestId("companion-save"));
    expect(view.getByTestId("companion-chat").textContent).toMatch(/Dev/);
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

  function countQuestion(view: ReturnType<typeof render>, question: string) {
    return view
      .queryAllByTestId("companion-turn-student")
      .filter((turn) => turn.textContent === question).length;
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
    expect(countQuestion(view, "Explain work and energy")).toBe(1);
    expect(thread).toMatch(/in one sentence|First review/i);
    expect(thread).toContain("Earlier question about joules");
    expect(
      readCompanionStore("student-a").turns.filter((turn) => turn.text === "Explain work and energy")
    ).toHaveLength(1);
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

  it("keeps one pair when Send is clicked twice before the account id arrives", async () => {
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
    const question = "Explain work and energy";
    fireEvent.change(view.getByTestId("companion-input"), { target: { value: question } });
    fireEvent.click(view.getByTestId("companion-ask"));
    fireEvent.click(view.getByTestId("companion-ask"));
    fireEvent.submit(view.getByTestId("companion-input").closest("form")!);
    expect(countQuestion(view, question)).toBe(1);

    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    fireEvent.click(view.getByTestId("companion-ask"));
    expect(countQuestion(view, question)).toBe(1);
    expect(view.getByTestId("companion-thread").textContent).toContain("Earlier question about joules");
    const saved = readCompanionStore("student-a").turns.filter((turn) => turn.text === question);
    expect(saved).toHaveLength(1);
    expect(readCompanionStore("student-a").turns.filter((turn) => turn.role === "companion")).toHaveLength(2);
  });

  it("submits once from Enter and still allows the same question after a new edit", async () => {
    await unlockTestVault("student-a");
    const view = render(<CompanionChat userId="student-a" initialStyle="teacher" />);
    const input = view.getByTestId("companion-input");
    const question = "Explain work and energy";
    fireEvent.change(input, { target: { value: question } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(countQuestion(view, question)).toBe(1);

    fireEvent.change(input, { target: { value: `${question}X` } });
    fireEvent.change(input, { target: { value: question } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(countQuestion(view, question)).toBe(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(countQuestion(view, question)).toBe(2);
    expect(readCompanionStore("student-a").turns.filter((turn) => turn.text === question)).toHaveLength(2);
  });

  it("ignores a restored copy of the question but accepts a deliberate paste", async () => {
    await unlockTestVault("student-a");
    const view = render(<CompanionChat userId="student-a" initialStyle="teacher" />);
    const question = "Explain work and energy";
    sendCompanionQuestion(view, question);
    const input = view.getByTestId("companion-input");
    fireEvent.change(input, { target: { value: question } });
    fireEvent.click(view.getByTestId("companion-ask"));
    expect(countQuestion(view, question)).toBe(1);

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, question);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    fireEvent.click(view.getByTestId("companion-ask"));
    expect(countQuestion(view, question)).toBe(2);
    expect(readCompanionStore("student-a").turns.filter((turn) => turn.text === question)).toHaveLength(2);
  });

  it("does not accept another submit while the reply is still being created", async () => {
    await unlockTestVault("student-a");
    const view = render(<CompanionChat userId="local-anonymous" initialStyle="teacher" />);
    const question = "Explain work and energy";
    fireEvent.change(view.getByTestId("companion-input"), { target: { value: question } });
    replyProbe.duringReply = () => {
      fireEvent.click(view.getByTestId("companion-ask"));
      fireEvent.keyDown(view.getByTestId("companion-input"), { key: "Enter" });
    };
    fireEvent.click(view.getByTestId("companion-ask"));
    expect(countQuestion(view, question)).toBe(1);

    view.rerender(<CompanionChat userId="student-a" initialStyle="teacher" />);
    expect(countQuestion(view, question)).toBe(1);
    expect(readCompanionStore("student-a").turns.filter((turn) => turn.text === question)).toHaveLength(1);
    expect(readCompanionStore("local-anonymous").turns.map((turn) => turn.text)).not.toContain(question);
  });
});
