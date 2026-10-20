# 01 — Clinical Prakriti & Adaptive Cognitive Engine Specification
## (*Dhee, Dhriti, Smriti* & *Alochaka Pitta* Digital Ergonomics)

---

## 1. Two-Part Assessment Architecture
The platform evaluates each student across two distinct, clinically grounded instruments:

1. **Basic Physical Prakriti Questionnaire (25–30 Questions):**
   - Evaluates classical anatomical, physiological, and metabolic traits (*Agni* / digestive fire, thermoregulation, sleep architecture, physical stamina, hydration needs).
   - Establishes the student's **Physical & Lifestyle Baseline**: governs *Dinacharya* break exercises, hydration alerts, posture cues, and ocular recovery protocols.

2. **Reading & Cognitive Ability Questionnaire (20 Questions):**
   - Evaluates 5 cognitive-digital domains:
     1. **Grasping Speed (*Dhee*):** How quickly new concepts are understood on first read.
     2. **Sustained Attention (*Dhriti*):** Resistance to distraction, tab-switching, and restlessness during long chapters.
     3. **Long-Term Retention (*Smriti*):** Recall durability over 24h, 72h, and 30-day intervals.
     4. **Screen Fatigue (*Alochaka Pitta*):** Susceptibility to photophobia, ocular heat, dry eyes, and visual contrast strain.
     5. **Video Lecture Habits:** Playback speed preferences, rewind frequency, and passive vs. active note-taking patterns.
   - Configures the **Digital Reader UI & AI Explanation Format**.

---

## 2. Weighted Formula & Classification Math

### 2.1 Domain Weighting
For each Dosha $d \in \{\text{Vata}, \text{Pitta}, \text{Kapha}\}$, let:
- $B_d \in [0, 100]$ be the normalized percentage score from the **Basic Physical Prakriti Questionnaire** ($\sum B_d = 100$).
- $R_d \in [0, 100]$ be the normalized percentage score from the **Reading & Cognitive Ability Questionnaire** ($\sum R_d = 100$).

Two composite vectors are computed:
1. **Reader UI & AI Format Score ($C^{\text{UI}}_d$):**
   $$C^{\text{UI}}_d = 0.70 \times R_d + 0.30 \times B_d$$
2. **Break Remedies & Lifestyle Nudges Score ($C^{\text{Life}}_d$):**
   $$C^{\text{Life}}_d = 0.50 \times R_d + 0.50 \times B_d$$

### 2.2 Single vs. Dual-Dosha (*Dwandwaja*) Classification Rule
Sorting the Reader UI & AI Format composite scores in descending order gives $(D_1, S_1), (D_2, S_2), (D_3, S_3)$ where $S_1 \ge S_2 \ge S_3$:
- **Single Dosha Dominant (`Vata`, `Pitta`, or `Kapha`):**
  - Triggered when the top score exceeds the second score by **more than 15%** ($S_1 - S_2 > 15$).
- **Dual-Dosha / *Dwandwaja* (`Vata-Pitta`, `Pitta-Kapha`, `Vata-Kapha`):**
  - Triggered when the top two scores are **within 15%** of each other ($S_1 - S_2 \le 15$).
  - **Governance Split in *Dwandwaja* Profiles:**
    - **Primary Dosha ($D_1$ of $C^{\text{UI}}$):** Governs the **AI Explanation Format**, default highlight lens, and reading card structure.
    - **Secondary Dosha ($D_2$ of $C^{\text{UI}}$ or dominant $C^{\text{Life}}$):** Governs the **Pomodoro study/break timer modulation, theme soothing guardrails, and Dinacharya lifestyle/break remedies**.

---

## 3. Prakriti Study Configurations

### 3.1 Vata (*Shighra-grahi / Alpa-smriti* — Fast Grasping, Quick Forgetting)
- **Visual Theme:** Warm Parchment (`#FBF5E8` background, `#2C221E` deep espresso text, `#D97736` warm terracotta accent, `#F3E8D2` card surface).
- **Study Sprint / Break Cadence:** **22-minute study sprint** / **5-minute grounding break**.
- **Dinacharya Break Prescription:** *Nadi Shodhana* (alternate nostril breathing) or *Bhramari Pranayama* (humming bee breath) + sipping warm water to calm erratic *Prana Vata*.
- **Reader UI Layout:** **Bite-Sized Focus Card View** — isolates 1–2 paragraphs at a time with gentle peripheral dimming to prevent cognitive overwhelm and skimming fatigue.
- **Default AI Pedagogy:** Story Analogies + Visual Mind-Maps + Audio TTS Summary + automated **24h / 72h Spaced Repetition Flashcards**.

### 3.2 Pitta (*Tikshna-buddhi / Medhavi* — Sharp Intellect, High Ocular & Mental Heat)
- **Visual Theme:** Cool Anti-Glare Sage-Ivory (`#F2F6F3` background, `#1C2826` deep forest-slate text, `#2E6F5E` cooling emerald-sage accent, `#E4EDE7` card surface).
- **Study Sprint / Break Cadence:** **40-minute deep sprint** / **8-minute cooling break**.
- **Dinacharya Break Prescription:** *Chakshushya* 20-ft distance gaze + warm-then-cool eye palming + *Sheetali Pranayama* (cooling breath) + cool or room-temperature fennel (*Mishreya*) infused water to pacify *Alochaka* & *Sadhaka Pitta*.
- **Reader UI Layout:** **Permanent Chapter Hierarchy Tree + % Mastery Progress Bar** — satisfies Pitta's analytical drive for structure, precision, and measurable completion.
- **Default AI Pedagogy:** Differential Comparison Tables + Pathogenesis/Mechanism Flowcharts + Exact Samhita/Page Citations.

### 3.3 Kapha (*Chira-grahi / Dridha-smriti* — Methodical Grasping, Steadfast Retention)
- **Visual Theme:** Bright Crisp High-Contrast Amber-White (`#FFFDF9` background, `#18181B` high-contrast charcoal text, `#D97706` energizing सूर्य/amber-gold accent, `#FEF7E6` card surface).
- **Study Sprint / Break Cadence:** **30-minute active block** (with a mandatory **15-minute micro-interaction tap check-in** to prevent passive drowsiness / *Tandra*) / **5-minute movement break**.
- **Dinacharya Break Prescription:** 3-minute brisk stand/walk stretch + *Kapalabhati* or energizing breathwork + warm ginger (*Shunthi*) or *Tulsi* water to stimulate *Bodhaka* & *Tarpaka Kapha*.
- **Reader UI Layout:** **Tap-to-Reveal Interactive Accordions** — requires active tactile engagement to uncover key takeaways rather than passive wall-of-text reading.
- **Default AI Pedagogy:** Socratic Question-First Prompts + Clinical Case Challenges + **10-minute Video Quiz Checkpoints**.

---

## 4. Self-Evolving Adaptive Memory (`student_cognitive_memory`)
- The engine continuously observes real study interactions without intrusive popups:
  - Note modification actions (`+ Add Detail`, `- Simplify`, `Show Analogy`, `Convert to Table`).
  - Video player friction signals (repeated 10s rewinds on specific timestamps, playback speed adjustments).
  - Quiz accuracy across conceptual vs. rote-memory questions.
- **Student Cognitive DNA Card:** Condenses behavioral signals into a compact **200-word "Student Cognitive DNA Card"** stored in `student_cognitive_memory` and injected into future AI system prompts for proactive, zero-click personalization.
