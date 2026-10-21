# 00 — Master Vision & Architecture Overview
## Oryzen Learn — Adaptive Intelligence & Focus Reader

---

## 1. Core Product Vision
A student-first, tablet-friendly AI document reading and video study platform combining:
- **Focus Book Reader:** Fluid, anti-glare, zero-lag digital textbook reader tailored for medical, Ayurvedic (BAMS/MD), and competitive exam students.
- **NotebookLM-Style Multi-Source Synthesis:** Cross-document and cross-lecture synthesis with strict paragraph-level and timestamp-level citations.
- **Parallel Video Lecture Studio:** Real-time synchronized note generation alongside video playback with instant interactive controls.
- **Classical Ayurvedic Cognitive Engine (*Dhee, Dhriti, Smriti*):** Personalizes UI color ergonomics, reading card density, Pomodoro sprint/break cycles, Dinacharya eye/breath exercises, and AI explanation pedagogy according to the student's constitutional and reading profile.

---

## 2. Zero Publisher Licensing Liability & Local-First Storage Architecture
- **Student-Owned Content:** Students upload their own authorized PDFs or local lecture videos (MP4/WebM) or link public/unlisted YouTube lectures. The platform does not host or redistribute pirated textbooks.
- **Browser Local-First Storage (`IndexedDB` / `OPFS`):** Heavy binary files (PDFs, local MP4s) are stored directly on the student's device via Browser `IndexedDB` and Origin Private File System (`OPFS`).
- **3-Page Virtualized RAM Window:** The PDF reader renders strictly a 3-page sliding window (`Page N-1`, `Page N`, `Page N+1`) in active canvas/DOM memory while disposing off-screen page buffers. This guarantees:
  - Zero browser tab crashes on 2GB–4GB RAM iPads and Android tablets even with 1,200-page Samhitas or textbooks.
  - Near-zero cloud storage and egress costs.

---

## 3. Multi-Lens Highlighting Engine
Highlighting any paragraph or passage in the reader opens a floating, touch-optimized action bar (minimum 44x44px targets) with **5 specialized cognitive lenses**:

1. **Ayurvedic View:** Correlates the highlighted text with classical *Samhita / Siddhanta* principles, *Dosha-Dushya-Srotas* pathogenesis (*Samprapti*), *Rasa-Guna-Virya-Vipaka-Prabhava*, and clinical *Chikitsa* principles.
2. **Illustrative View:** Generates visual flowcharts (Mermaid/SVG), real-world analogies, and structural mind-maps for rapid conceptual grasping (*Dhee*).
3. **High-Yield Revision View:** Condenses complex prose into differential comparison tables, exam-focused bullet points, and high-retention mnemonics (*Smriti*).
4. **Add to Compendium:** Saves the highlight and AI synthesis into the student's structured Compendium with a **bi-directional deep link** back to the exact PDF document, page number, and bounding-box coordinates.
5. **Test Me:** Instantly generates paragraph-grounded Multiple Choice Questions (MCQs) and assertion-reason prompts to verify active recall before moving forward.

---

## 4. Parallel Video Lecture Studio
- **Dual-Source Playback:** Students paste a YouTube lecture link (Public or Unlisted via YouTube IFrame Player API) or load a local video file from device storage.
- **Real-Time Timestamp-Synced Notes:** As the video plays in the left/top pane, the right/bottom pane reveals structured, Prakriti-formatted study notes synchronized in real time alongside the teacher's voice.
- **Interactive Timestamp Badges & 1-Tap Controls:**
  - Every note block features a clickable timestamp badge (e.g., `[04:18]`) that seeks the video player directly to that moment.
  - 1-tap note modification controls allow students to expand detail, simplify into an analogy, convert to a flowchart, or flag high-yield exam points on the fly.

---

## 5. Multi-Source Synthesis Studio
- Allows students to select **2+ saved passages** (from PDF reading sessions) and **2+ video lecture transcripts/note sets** and merge them into **1 unified, Prakriti-formatted Master Study Book**.
- Every synthesized section preserves strict inline citations (`[Doc: Charaka Vol 1, p. 142]` or `[Video: Kayachikitsa Lec 4, 18:22]`) that open the exact source upon tap.

---

## 6. B2C Freemium to B2B Coaching Institute Portal
- **B2C Individual Tier:** Freemium baseline with affordable monthly/Exam-Pass subscriptions bounded by the 5-Shield AI Profit Protection System.
- **B2B Multi-Tenant Coaching Institute Portal (`organizations`):**
  - Coaching institutes and colleges onboard cohorts via isolated multi-tenant `organizations`.
  - Distribute DRM-protected, dynamically watermarked PDFs (displaying student name, phone/ID, and timestamp across pages) and curated batch lecture links.
  - Faculty analytics on cohort reading completion, high-friction paragraphs, and quiz accuracy.
