"use client";

import React, { useState } from "react";
import SynthesisStudio from "@/components/synthesis/SynthesisStudio";
import StudySidePanel from "@/components/study/StudySidePanel";
import StudioFrame from "@/components/studio/StudioFrame";
import {
  calculatePrakritiProfile,
  type Dosha,
} from "@/lib/prakriti/config";

function scoresFor(dosha: Dosha) {
  if (dosha === "Pitta") return { Vata: 15, Pitta: 70, Kapha: 15 };
  if (dosha === "Kapha") return { Vata: 10, Pitta: 20, Kapha: 70 };
  return { Vata: 70, Pitta: 20, Kapha: 10 };
}

export default function MultiSourceSynthesisPage() {
  const [activeDosha, setActiveDosha] = useState<Dosha>("Pitta");
  const scores = scoresFor(activeDosha);
  const profile = calculatePrakritiProfile(scores, scores);

  return (
    <StudioFrame
      title="Bring Your Knowledge Together"
      eyebrow="Connect Your Knowledge"
      activeDosha={activeDosha}
      onChangeDosha={setActiveDosha}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <SynthesisStudio
          prakritiDosha={activeDosha}
          theme={profile.activeConfiguration.theme}
        />
        <StudySidePanel dosha={activeDosha} />
      </div>
    </StudioFrame>
  );
}
