import {
  normalizeDoshaScores,
  type Dosha,
  type DoshaScores,
} from "./config";

export type PhysicalClusterId =
  | "agni_metabolism"
  | "thermoregulation_hydration"
  | "sharira_body_frame"
  | "nidra_sleep_stamina"
  | "manas_stress_dinacharya";

export type ReadingCognitiveDomainId =
  | "dhee_grasping"
  | "dhriti_attention"
  | "smriti_retention"
  | "alochaka_pitta_screen_fatigue"
  | "video_lecture_habits";

export interface AssessmentQuestion {
  id: string;
  number: number;
  domainId: PhysicalClusterId | ReadingCognitiveDomainId;
  domainLabel: string;
  prompt: string;
  options: Record<Dosha, string>;
}

/**
 * Step 1: 25 Basic Physical Prakriti Questions
 * across 5 physiological clusters (Agni, Thermoregulation/Hydration, Sharira Frame, Nidra/Stamina, Dinacharya/Stress).
 */
export const BASIC_PHYSICAL_PRAKRITI_QUESTIONS: AssessmentQuestion[] = [
  // Cluster 1: Agni & Digestive Metabolism (Q1 - Q5)
  {
    id: "phys-1",
    number: 1,
    domainId: "agni_metabolism",
    domainLabel: "Digestion & appetite",
    prompt: "How is your daily appetite and digestive fire (Jatharagni)?",
    options: {
      Vata: "Irregular (Vishamagni) — hungry at unpredictable times, sometimes bloating",
      Pitta: "Sharp & intense (Tikshnagni) — cannot tolerate skipping meals without irritability",
      Kapha: "Steady & mild (Mandagni) — can comfortably skip a meal without discomfort",
    },
  },
  {
    id: "phys-2",
    number: 2,
    domainId: "agni_metabolism",
    domainLabel: "Digestion & appetite",
    prompt: "How do you feel immediately after eating a full meal before studying?",
    options: {
      Vata: "Light and restless, ready to move or switch tasks quickly",
      Pitta: "Warm and energized, ready for analytical work if meal is cooling",
      Kapha: "Heavy or slightly sleepy (Tandra), needing movement or warm tea",
    },
  },
  {
    id: "phys-3",
    number: 3,
    domainId: "agni_metabolism",
    domainLabel: "Digestion & appetite",
    prompt: "What type of food and beverage temperature do you naturally crave?",
    options: {
      Vata: "Warm, comforting, soupy, and lightly spiced foods",
      Pitta: "Cool or room-temperature, refreshing, sweet/bitter foods",
      Kapha: "Warm, dry, pungent, and spiced foods with ginger/tulsi",
    },
  },
  {
    id: "phys-4",
    number: 4,
    domainId: "agni_metabolism",
    domainLabel: "Digestion & appetite",
    prompt: "How does exam stress affect your digestion?",
    options: {
      Vata: "Gas, dryness, or sudden loss of appetite",
      Pitta: "Acidity, heartburn, or heightened hunger",
      Kapha: "Slow digestion or emotional craving for sweets/snacks",
    },
  },
  {
    id: "phys-5",
    number: 5,
    domainId: "agni_metabolism",
    domainLabel: "Digestion & appetite",
    prompt: "How consistent is your body weight across an academic semester?",
    options: {
      Vata: "Naturally slender; loses weight easily during intense exam weeks",
      Pitta: "Moderate and stable; fluctuates only with changes in routine",
      Kapha: "Gains weight easily and retains mass even with lighter meals",
    },
  },

  // Cluster 2: Thermoregulation & Hydration (Q6 - Q10)
  {
    id: "phys-6",
    number: 6,
    domainId: "thermoregulation_hydration",
    domainLabel: "Temperature & hydration",
    prompt: "What is your typical hand, foot, and body temperature in an air-conditioned library?",
    options: {
      Vata: "Hands and feet get cold quickly; prefer a shawl or warm room",
      Pitta: "Feel warm easily; prefer cool ventilation or fan",
      Kapha: "Adaptable, though dislike cold-damp weather",
    },
  },
  {
    id: "phys-7",
    number: 7,
    domainId: "thermoregulation_hydration",
    domainLabel: "Temperature & hydration",
    prompt: "How frequently do you experience thirst during study blocks?",
    options: {
      Vata: "Variable thirst; often forget to drink water until lips feel dry",
      Pitta: "Frequent, strong thirst; need cool or room-temp water nearby",
      Kapha: "Low thirst; rarely feel parched during reading sessions",
    },
  },
  {
    id: "phys-8",
    number: 8,
    domainId: "thermoregulation_hydration",
    domainLabel: "Temperature & hydration",
    prompt: "How does your skin and lip moisture behave across seasons?",
    options: {
      Vata: "Tends toward dryness, roughness, or chapped lips",
      Pitta: "Warm, sensitive, prone to redness or warmth under sun/screens",
      Kapha: "Smooth, naturally hydrated, cool, and soft",
    },
  },
  {
    id: "phys-9",
    number: 9,
    domainId: "thermoregulation_hydration",
    domainLabel: "Temperature & hydration",
    prompt: "How much do you perspire during normal daily activities?",
    options: {
      Vata: "Minimal perspiration even in warm weather",
      Pitta: "Profuse perspiration, especially when focused or warm",
      Kapha: "Moderate, steady perspiration only during physical exertion",
    },
  },
  {
    id: "phys-10",
    number: 10,
    domainId: "thermoregulation_hydration",
    domainLabel: "Temperature & hydration",
    prompt: "Which climate supports your best study concentration?",
    options: {
      Vata: "Warm, calm, humid environment without cold drafts",
      Pitta: "Cool, airy, shaded room with low glare",
      Kapha: "Bright, warm, dry, and well-lit study space",
    },
  },

  // Cluster 3: Sharira Body Frame & Motor Tempo (Q11 - Q15)
  {
    id: "phys-11",
    number: 11,
    domainId: "sharira_body_frame",
    domainLabel: "Body frame & movement",
    prompt: "How would you describe your natural skeletal frame and joints?",
    options: {
      Vata: "Light, narrow frame with prominent or cracking joints",
      Pitta: "Medium, proportionate build with balanced muscle tone",
      Kapha: "Broad, sturdy frame with well-padded, stable joints",
    },
  },
  {
    id: "phys-12",
    number: 12,
    domainId: "sharira_body_frame",
    domainLabel: "Body frame & movement",
    prompt: "What is your natural walking and speaking pace?",
    options: {
      Vata: "Quick, animated, rapid steps and fast speech",
      Pitta: "Focused, purposeful stride and articulate, sharp speech",
      Kapha: "Unhurried, grounded gait and calm, resonant speech",
    },
  },
  {
    id: "phys-13",
    number: 13,
    domainId: "sharira_body_frame",
    domainLabel: "Body frame & movement",
    prompt: "When sitting at a desk with a tablet, how is your posture?",
    options: {
      Vata: "Frequently shifting positions, tapping foot, or fidgeting",
      Pitta: "Upright, leaning forward intensely toward the screen",
      Kapha: "Still and relaxed for long periods; may slouch into comfort",
    },
  },
  {
    id: "phys-14",
    number: 14,
    domainId: "sharira_body_frame",
    domainLabel: "Body frame & movement",
    prompt: "How is your handwriting or stylus annotation style on a tablet?",
    options: {
      Vata: "Fast, cursive, variable pressure, quick arrows and scribbles",
      Pitta: "Neat, structured, color-coded, sharp and aligned",
      Kapha: "Rounded, deliberate, consistent, and unhurried",
    },
  },
  {
    id: "phys-15",
    number: 15,
    domainId: "sharira_body_frame",
    domainLabel: "Body frame & movement",
    prompt: "How do your eyes feel physically by evening?",
    options: {
      Vata: "Dry, blinking frequently, or twitching when tired",
      Pitta: "Warm, burning, or sensitive to bright white screens",
      Kapha: "Cool and steady, occasionally heavy-lidded when sleepy",
    },
  },

  // Cluster 4: Nidra (Sleep) & Physical Stamina (Q16 - Q20)
  {
    id: "phys-16",
    number: 16,
    domainId: "nidra_sleep_stamina",
    domainLabel: "Sleep & stamina",
    prompt: "How would you describe your sleep quality during exam preparation?",
    options: {
      Vata: "Light, interrupted sleep (Alpa-nidra) with active dreams",
      Pitta: "Moderate 6–7h sleep; wake up alert but warm if room is hot",
      Kapha: "Deep, sound 8h+ sleep; takes effort to wake up early",
    },
  },
  {
    id: "phys-17",
    number: 17,
    domainId: "nidra_sleep_stamina",
    domainLabel: "Sleep & stamina",
    prompt: "How does your energy curve behave across the day?",
    options: {
      Vata: "Comes in bursts of high enthusiasm followed by sudden fatigue",
      Pitta: "Strong, driven energy peaking at midday and late evening",
      Kapha: "Slow start in the morning, building into steady marathon endurance",
    },
  },
  {
    id: "phys-18",
    number: 18,
    domainId: "nidra_sleep_stamina",
    domainLabel: "Sleep & stamina",
    prompt: "How quickly do you recover from a late-night study session?",
    options: {
      Vata: "Feel wired yet exhausted the next day; need grounding rest",
      Pitta: "Power through on willpower, but eyes and temper feel heated",
      Kapha: "Need extra morning sleep or brisk movement to shake off grogginess",
    },
  },
  {
    id: "phys-19",
    number: 19,
    domainId: "nidra_sleep_stamina",
    domainLabel: "Sleep & stamina",
    prompt: "What type of physical break refreshes you most between chapters?",
    options: {
      Vata: "Quiet slow breathing (Nadi Shodhana) and warm water",
      Pitta: "Cooling eye palming, 20-ft window gaze, and Sheetali breath",
      Kapha: "Brisk 3-minute standing stretch, walking, and energizing breath",
    },
  },
  {
    id: "phys-20",
    number: 20,
    domainId: "nidra_sleep_stamina",
    domainLabel: "Sleep & stamina",
    prompt: "What is your natural physical endurance during 8-hour college days?",
    options: {
      Vata: "High initial agility, but physically drained by late afternoon",
      Pitta: "Strong competitive stamina unless overheated or hungry",
      Kapha: "High physical stamina; rarely exhausted physically",
    },
  },

  // Cluster 5: Manas Stress Response & Dinacharya (Q21 - Q25)
  {
    id: "phys-21",
    number: 21,
    domainId: "manas_stress_dinacharya",
    domainLabel: "Stress & daily rhythm",
    prompt: "What is your primary emotional response when syllabus load feels huge?",
    options: {
      Vata: "Anxiousness, overthinking, or jumping between 5 textbooks at once",
      Pitta: "Frustration, self-criticism, and hyper-scheduled perfectionism",
      Kapha: "Procrastination, withdrawal, or sticking to familiar easy chapters",
    },
  },
  {
    id: "phys-22",
    number: 22,
    domainId: "manas_stress_dinacharya",
    domainLabel: "Stress & daily rhythm",
    prompt: "How do you relate to daily routines (Dinacharya)?",
    options: {
      Vata: "Dislike rigid schedules, yet thrive when gently anchored",
      Pitta: "Love structured timetables, checklists, and measurable targets",
      Kapha: "Consistent once a habit starts, but need nudges to initiate change",
    },
  },
  {
    id: "phys-23",
    number: 23,
    domainId: "manas_stress_dinacharya",
    domainLabel: "Stress & daily rhythm",
    prompt: "How do you react to background noise while studying?",
    options: {
      Vata: "Easily startled or distracted by sudden sounds",
      Pitta: "Irritated by interruptions when locked in deep focus",
      Kapha: "Rarely bothered by ambient noise; can tune it out",
    },
  },
  {
    id: "phys-24",
    number: 24,
    domainId: "manas_stress_dinacharya",
    domainLabel: "Stress & daily rhythm",
    prompt: "How do you start a new textbook or subject module?",
    options: {
      Vata: "Excitedly browse multiple chapters and illustrations first",
      Pitta: "Inspect the syllabus weightage, table of contents, and mastery goals",
      Kapha: "Read page 1 line-by-line at a steady, unhurried pace",
    },
  },
  {
    id: "phys-25",
    number: 25,
    domainId: "manas_stress_dinacharya",
    domainLabel: "Stress & daily rhythm",
    prompt: "What helps restore your mental calm in 5 minutes?",
    options: {
      Vata: "Humming bee breath (Bhramari) and warm herbal hydration",
      Pitta: "Stepping away from the screen to rest eyes on greenery",
      Kapha: "Standing up, stretching spine, and taking 20 brisk breaths",
    },
  },
];

/**
 * Step 2: 20 Reading & Cognitive Ability Questions across the 5 Digital-Cognitive Domains:
 * 1. Grasping / Dhee (4 questions)
 * 2. Attention / Dhriti (4 questions)
 * 3. Retention / Smriti (4 questions)
 * 4. Screen Fatigue / Alochaka Pitta (4 questions)
 * 5. Video Lecture Habits (4 questions)
 */
export const READING_COGNITIVE_QUESTIONS: AssessmentQuestion[] = [
  // Domain 1: Grasping / Dhee (Q1 - Q4)
  {
    id: "cog-1",
    number: 1,
    domainId: "dhee_grasping",
    domainLabel: "Quick-Take Speed (Grasping / Dhee)",
    prompt: "When reading a complex theorem, argument, or mechanism for the first time:",
    options: {
      Vata: "Grasp the big-picture idea rapidly (Shighra-grahi), especially via story analogies",
      Pitta: "Analyze cause-and-effect logic and differential points sharply (Tikshna-buddhi)",
      Kapha: "Absorb methodically after reading slowly and working through an example (Chira-grahi)",
    },
  },
  {
    id: "cog-2",
    number: 2,
    domainId: "dhee_grasping",
    domainLabel: "Quick-Take Speed (Grasping / Dhee)",
    prompt: "Which AI explanation format unlocks a difficult paragraph fastest for you?",
    options: {
      Vata: "Visual mind-map + relatable real-world analogy + audio summary",
      Pitta: "Structured comparison table + cause-and-effect flowchart + exact citations",
      Kapha: "Socratic step-by-step question prompt + worked example",
    },
  },
  {
    id: "cog-3",
    number: 3,
    domainId: "dhee_grasping",
    domainLabel: "Quick-Take Speed (Grasping / Dhee)",
    prompt: "How much text density on a single tablet screen feels optimal for comprehension?",
    options: {
      Vata: "1–2 focused paragraphs isolated as a card (prevents visual overwhelm)",
      Pitta: "Full structured page with permanent chapter outline & mastery percentage",
      Kapha: "Interactive tap-to-reveal accordions that keep me actively engaged",
    },
  },
  {
    id: "cog-4",
    number: 4,
    domainId: "dhee_grasping",
    domainLabel: "Quick-Take Speed (Grasping / Dhee)",
    prompt: "When connecting a core idea in your subject to a concrete example:",
    options: {
      Vata: "Love creative conceptual bridges and visual metaphors",
      Pitta: "Demand precise comparison tables and mapped relationships",
      Kapha: "Prefer concrete worked examples with clear takeaways",
    },
  },

  // Domain 2: Sustained Attention / Dhriti (Q5 - Q8)
  {
    id: "cog-5",
    number: 5,
    domainId: "dhriti_attention",
    domainLabel: "Focus Stamina (Focus Stability / Dhriti)",
    prompt: "How long can you read continuously on a tablet before your attention drifts?",
    options: {
      Vata: "~20–22 minutes before urge to skim, switch tabs, or check phone",
      Pitta: "~40 minutes of intense laser lock-in before mental heat builds up",
      Kapha: "~30 minutes steady, though passive reading can induce drowsiness at 15m",
    },
  },
  {
    id: "cog-6",
    number: 6,
    domainId: "dhriti_attention",
    domainLabel: "Focus Stamina (Focus Stability / Dhriti)",
    prompt: "What is your biggest focus trap during digital textbook study?",
    options: {
      Vata: "Skimming too fast over key lines and jumping across chapters",
      Pitta: "Over-analyzing minor details and refusing to take cooling breaks",
      Kapha: "Zoning out passively while eyes move over paragraphs without active recall",
    },
  },
  {
    id: "cog-7",
    number: 7,
    domainId: "dhriti_attention",
    domainLabel: "Focus Stamina (Focus Stability / Dhriti)",
    prompt: "How do you respond to a mid-session interactive check-in?",
    options: {
      Vata: "Prefer short 22-min sprints rather than interruptions mid-sprint",
      Pitta: "Prefer uninterrupted 40-min deep blocks with a visible progress bar",
      Kapha: "A 15-min micro-quiz tap check-in keeps me alert and prevents sleepiness",
    },
  },
  {
    id: "cog-8",
    number: 8,
    domainId: "dhriti_attention",
    domainLabel: "Focus Stamina (Focus Stability / Dhriti)",
    prompt: "When reading a 60-page chapter, what keeps your Dhriti anchored?",
    options: {
      Vata: "Bite-sized card progression where each swipe feels achievable",
      Pitta: "Seeing chapter hierarchy checkboxes turn green toward 100% mastery",
      Kapha: "Interactive Socratic prompts at the end of every section",
    },
  },

  // Domain 3: Long-Term Retention / Smriti (Q9 - Q12)
  {
    id: "cog-9",
    number: 9,
    domainId: "smriti_retention",
    domainLabel: "Recall Power (Retention / Smriti)",
    prompt: "How well do you recall a chapter 72 hours after reading it once?",
    options: {
      Vata: "Quickly forget details (Alpa-smriti) unless reinforced at 24h and 72h",
      Pitta: "Retain logical structure and tables well; miss only rote lists",
      Kapha: "Once understood, memory stays rock-solid for weeks (Dridha-smriti)",
    },
  },
  {
    id: "cog-10",
    number: 10,
    domainId: "smriti_retention",
    domainLabel: "Recall Power (Retention / Smriti)",
    prompt: "Which revision tool locks facts into your long-term memory best?",
    options: {
      Vata: "Automated 24h/72h spaced flashcards + rhythmic audio/story mnemonics",
      Pitta: "High-yield differential tables + concise bulleted revision sheets",
      Kapha: "Active recall Test-Me questions and applied practice challenges",
    },
  },
  {
    id: "cog-11",
    number: 11,
    domainId: "smriti_retention",
    domainLabel: "Recall Power (Retention / Smriti)",
    prompt: "During exams, how do you retrieve stored knowledge?",
    options: {
      Vata: "Recall visual mind-maps, stories, or audio voice notes",
      Pitta: "Visualize the exact comparison table or flowchart hierarchy",
      Kapha: "Steady sequential recall of cases and practiced questions",
    },
  },
  {
    id: "cog-12",
    number: 12,
    domainId: "smriti_retention",
    domainLabel: "Recall Power (Retention / Smriti)",
    prompt: "How often do you need to revisit highlights you saved in your notebook?",
    options: {
      Vata: "Frequent, bite-sized 5-minute flashcard bursts every 1–3 days",
      Pitta: "Structured weekly mastery review of flagged high-yield tables",
      Kapha: "Periodic active quiz checkpoints to verify deep memory",
    },
  },

  // Domain 4: Screen Fatigue / Alochaka Pitta (Q13 - Q16)
  {
    id: "cog-13",
    number: 13,
    domainId: "alochaka_pitta_screen_fatigue",
    domainLabel: "Screen Fatigue (Alochaka Pitta)",
    prompt: "Which Digital Reader Studio background tone feels most soothing on your eyes for 3+ hours?",
    options: {
      Vata: "Warm Parchment (#FBF5E8) — cozy, grounding, zero starkness",
      Pitta: "Cool Anti-Glare Sage-Ivory (#F2F6F3) — pacifies ocular heat and glare",
      Kapha: "Bright Crisp High-Contrast Amber-White (#FFFDF9) — keeps eyes alert",
    },
  },
  {
    id: "cog-14",
    number: 14,
    domainId: "alochaka_pitta_screen_fatigue",
    domainLabel: "Screen Fatigue (Alochaka Pitta)",
    prompt: "What ocular symptom appears first during intense tablet study?",
    options: {
      Vata: "Dryness, erratic eye jumping across lines, or mild frontal tension",
      Pitta: "Photophobia, ocular heat/redness, or burning sensation from white glare",
      Kapha: "Heavy eyelids and reduced blinking alertness during long prose",
    },
  },
  {
    id: "cog-15",
    number: 15,
    domainId: "alochaka_pitta_screen_fatigue",
    domainLabel: "Screen Fatigue (Alochaka Pitta)",
    prompt: "Which ocular recovery protocol relieves your screen fatigue best?",
    options: {
      Vata: "Closing eyes with slow Bhramari breath and warm palm grounding",
      Pitta: "Chakshushya 20-ft distance gaze + cooling eye palming + fennel water",
      Kapha: "Looking up, standing for brisk movement, and splashing cool water",
    },
  },
  {
    id: "cog-16",
    number: 16,
    domainId: "alochaka_pitta_screen_fatigue",
    domainLabel: "Screen Fatigue (Alochaka Pitta)",
    prompt: "How sensitive are you to harsh contrast and blue-white backlighting?",
    options: {
      Vata: "Prefer soft warm sepia/parchment borders that feel like real paper",
      Pitta: "Highly sensitive to glare; require cool sage-ivory anti-glare surfaces",
      Kapha: "Prefer crisp, bright, high-contrast typography that stimulates alertness",
    },
  },

  // Domain 5: Video Lecture Habits (Q17 - Q20)
  {
    id: "cog-17",
    number: 17,
    domainId: "video_lecture_habits",
    domainLabel: "Learn from Videos",
    prompt: "How do you typically watch recorded video lectures on YouTube or tablet?",
    options: {
      Vata: "Watch in short bursts, often rewinding 10s when mind wanders",
      Pitta: "Watch at 1.25x–1.5x speed while taking structured timestamped notes",
      Kapha: "Watch at 1.0x–1.25x steadily, but risk passive watching without quizzes",
    },
  },
  {
    id: "cog-18",
    number: 18,
    domainId: "video_lecture_habits",
    domainLabel: "Learn from Videos",
    prompt: "What should Learn from Videos show beside the lecture as the teacher speaks?",
    options: {
      Vata: "Reveal bite-sized visual summary cards and story analogies synced to [mm:ss]",
      Pitta: "Stream structured mechanism flowcharts and comparison tables synced to [mm:ss]",
      Kapha: "Prompt a quick 1-tap checkpoint question every 10 minutes of video",
    },
  },
  {
    id: "cog-19",
    number: 19,
    domainId: "video_lecture_habits",
    domainLabel: "Learn from Videos",
    prompt: "Which 1-tap note modification button do you reach for most during lectures?",
    options: {
      Vata: "'Make It Easier' and 'Show an Example'",
      Pitta: "'Turn Into a Table' and 'Explain Further'",
      Kapha: "'Test Me' and a short worked example",
    },
  },
  {
    id: "cog-20",
    number: 20,
    domainId: "video_lecture_habits",
    domainLabel: "Learn from Videos",
    prompt: "When you bring lectures and documents together into one study guide:",
    options: {
      Vata: "Format with visual mind-maps, concise cards, and audio-friendly summaries",
      Pitta: "Format with hierarchical numbering, tables, and strict inline citations",
      Kapha: "Format with Socratic Q&A blocks and active recall checkpoints",
    },
  },
];

/**
 * Computes normalized DoshaScores (summing to 100%) from a map of questionId -> selected Dosha,
 * optionally blended with modular domain slider adjustments.
 */
export function computeScoresFromResponses(
  questions: AssessmentQuestion[],
  answers: Record<string, Dosha>,
  sliderOverrides?: DoshaScores | null
): DoshaScores {
  if (sliderOverrides) {
    return normalizeDoshaScores(sliderOverrides);
  }

  const counts: DoshaScores = { Vata: 0, Pitta: 0, Kapha: 0 };
  for (const q of questions) {
    const chosen = answers[q.id];
    if (chosen === "Vata" || chosen === "Pitta" || chosen === "Kapha") {
      counts[chosen] += 1;
    }
  }

  return normalizeDoshaScores(counts);
}
