import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PAST_PAPER_EXAMS, rankSubject, valueLabel } from "../weightage";
import { PastPapers } from "@/components/pyq/PastPapers";

const exam = (id: string) => PAST_PAPER_EXAMS.find((item) => item.id === id)!;

describe("past paper weightage", () => {
  it("has five years for every NEET chapter and CBSE units that add up to the paper", () => {
    for (const subject of exam("neet").subjects) {
      for (const item of subject.items) expect(item.years).toHaveLength(5);
    }
    for (const id of ["cbse10", "cbse12"]) {
      for (const subject of exam(id).subjects) {
        expect(subject.items.reduce((sum, item) => sum + (item.marks ?? 0), 0)).toBe(subject.totalMarks);
      }
    }
  });

  it("ranks NEET Biology with Molecular Basis of Inheritance first and marks chapters asked every year", () => {
    const biology = rankSubject(exam("neet"), exam("neet").subjects.find((s) => s.name === "Biology")!);
    expect(biology[0].name).toBe("Molecular Basis of Inheritance");
    expect(biology[0]).toMatchObject({ band: "high", everyYear: true, value: 7.4 });
    expect(valueLabel(exam("neet"), biology[0])).toBe("about 7.4 a year");
    expect(biology.find((item) => item.name === "The Living World")?.everyYear).toBe(false);
    expect(biology.at(-1)?.band).toBe("low");
  });

  it("turns JEE shares into questions per paper and CBSE into marks", () => {
    const maths = rankSubject(exam("jee_main"), exam("jee_main").subjects.find((s) => s.name === "Mathematics")!);
    expect(maths[0].name).toBe("Coordinate Geometry");
    expect(valueLabel(exam("jee_main"), maths[0])).toBe("about 3.4 per paper");
    const cbse = rankSubject(exam("cbse12"), exam("cbse12").subjects.find((s) => s.name === "Mathematics")!);
    expect(valueLabel(exam("cbse12"), cbse[0])).toBe("35 marks");
  });

  it("shows the list and switches exam and subject", () => {
    render(<PastPapers />);
    expect(screen.getByTestId("pyq-list").textContent).toMatch(/Electrostatic Potential|Current Electricity/);
    fireEvent.click(screen.getByTestId("pyq-exam-cbse10"));
    fireEvent.click(screen.getByRole("tab", { name: "Science" }));
    expect(screen.getByTestId("pyq-list").textContent).toMatch(/Chemical Substances/);
    expect(screen.getByText(/CBSE Academic website/)).toBeTruthy();
  });
});
