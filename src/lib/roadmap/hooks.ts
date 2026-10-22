import type { RoadmapSession, RoadmapStudyLinks, StudyRhythmHook } from "./types";

export function roadmapStudyLinks(input: {
  subjectName?: string;
  chapterName?: string;
}): RoadmapStudyLinks {
  const subject = (input.subjectName ?? "").trim();
  const chapter = (input.chapterName ?? "").trim();
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (chapter) params.set("chapter", chapter);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  const readerParams = new URLSearchParams(params);
  readerParams.set("lens", "test_me");
  const weakParams = new URLSearchParams(params);
  weakParams.set("view", "weak");
  return {
    reader: `/reader${suffix}`,
    notes: `/notes${suffix}`,
    testMe: `/reader?${readerParams.toString()}`,
    weakConcepts: `/reader?${weakParams.toString()}`,
  };
}

export function linksForSession(session: RoadmapSession): RoadmapStudyLinks {
  return roadmapStudyLinks({
    subjectName: session.subjectName,
    chapterName: session.chapterName,
  });
}

export function emptyStudyRhythmHook(): StudyRhythmHook {
  return {
    preferredThemeId: undefined,
    coachStyle: undefined,
    encouragementOff: undefined,
    coachSlot: undefined,
  };
}

export function mergeStudyRhythmHook(
  current: StudyRhythmHook | undefined,
  next: StudyRhythmHook
): StudyRhythmHook {
  return { ...emptyStudyRhythmHook(), ...current, ...next };
}
