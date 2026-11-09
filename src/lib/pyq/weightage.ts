/**
 * Past papers: what comes most (group B, owner 9 Nov 2026: "chapter analysis only").
 * No questions are copied. NEET and JEE Main figures come from published analyses of past
 * papers; CBSE figures are the official marks per unit from the CBSE curriculum.
 * Free to run: no AI.
 */

export type PastPaperExamId = "neet" | "jee_main" | "cbse12" | "cbse10";

export interface WeightageItem {
  name: string;
  /** NEET: questions in each year, oldest first. */
  years?: number[];
  /** JEE Main: share of the subject's questions, in percent. */
  percent?: number;
  /** CBSE: marks in the theory paper. */
  marks?: number;
  /** CBSE: the chapters in this unit. */
  chapters?: string;
}

export interface WeightageSubject {
  name: string;
  /** CBSE: theory paper total. */
  totalMarks?: number;
  items: WeightageItem[];
}

export interface PastPaperExam {
  id: PastPaperExamId;
  label: string;
  /** What the numbers mean, in one line. */
  basis: string;
  sourceName: string;
  sourceUrl: string;
  years?: number[];
  /** JEE Main: questions per subject in one paper. */
  questionsPerSubject?: number;
  subjects: WeightageSubject[];
}

export const PAST_PAPER_EXAMS: readonly PastPaperExam[] = [
  {
    id: "neet",
    label: "NEET",
    basis: "Questions from each chapter in NEET 2021 to 2025, from a published analysis of the papers.",
    sourceName: "Sartha: NEET chapter-wise weightage 2021–2025",
    sourceUrl: "https://sartha.in/blogs/neet-chapterwise-weightage-physics-chemistry-biology-2021-to-2025",
    years: [2021, 2022, 2023, 2024, 2025],
    subjects: [
    {
      name: "Physics",
      items: [
      { name: "Units and Measurements", years: [3, 2, 2, 3, 2] },
      { name: "Motion in a Straight Line", years: [2, 2, 3, 1, 2] },
      { name: "Motion in a Plane", years: [1, 1, 2, 2, 0] },
      { name: "Laws of Motion", years: [1, 1, 1, 1, 3] },
      { name: "Work, Energy and Power", years: [1, 1, 1, 2, 2] },
      { name: "System of Particles and Rotational Motion", years: [2, 3, 2, 2, 1] },
      { name: "Gravitation", years: [3, 2, 2, 2, 3] },
      { name: "Mechanical Properties of Solids", years: [0, 1, 1, 2, 0] },
      { name: "Mechanical Properties of Fluids", years: [1, 2, 2, 1, 1] },
      { name: "Thermal Properties of Matter", years: [0, 0, 0, 0, 1] },
      { name: "Thermodynamics", years: [0, 1, 0, 2, 1] },
      { name: "Kinetic Theory", years: [1, 1, 1, 0, 2] },
      { name: "Oscillations", years: [2, 1, 1, 2, 2] },
      { name: "Waves", years: [0, 1, 1, 0, 1] },
      { name: "Electric Charges and Fields", years: [0, 1, 2, 2, 0] },
      { name: "Electrostatic Potential and Capacitance", years: [6, 3, 2, 2, 3] },
      { name: "Current Electricity", years: [4, 4, 4, 3, 3] },
      { name: "Moving Charges and Magnetism", years: [4, 3, 2, 1, 2] },
      { name: "Magnetism and Matter", years: [0, 1, 1, 3, 0] },
      { name: "Electromagnetic Induction", years: [1, 2, 0, 2, 0] },
      { name: "Alternating Current", years: [2, 2, 3, 2, 2] },
      { name: "Electromagnetic Waves", years: [2, 3, 2, 2, 2] },
      { name: "Ray Optics and Optical Instruments", years: [4, 3, 3, 2, 2] },
      { name: "Wave Optics", years: [0, 1, 1, 2, 2] },
      { name: "Dual Nature of Radiation and Matter", years: [2, 2, 2, 2, 2] },
      { name: "Atoms", years: [0, 1, 2, 2, 3] },
      { name: "Nuclei", years: [1, 1, 0, 1, 0] },
      { name: "Semiconductor Electronics", years: [3, 3, 3, 4, 2] },
      ],
    },
    {
      name: "Chemistry",
      items: [
      { name: "Some Basic Concepts of Chemistry", years: [1, 1, 1, 3, 2] },
      { name: "Structure of Atom", years: [1, 2, 1, 2, 2] },
      { name: "Classification of Elements and Periodicity", years: [1, 1, 1, 2, 2] },
      { name: "Chemical Bonding and Molecular Structure", years: [3, 2, 2, 2, 2] },
      { name: "Thermodynamics", years: [2, 1, 1, 3, 1] },
      { name: "Equilibrium", years: [1, 2, 2, 3, 3] },
      { name: "Redox Reactions", years: [1, 0, 1, 1, 1] },
      { name: "p-Block Elements (Groups 13 and 14)", years: [0, 0, 1, 0, 0] },
      { name: "Organic Chemistry: Basic Principles (GOC)", years: [2, 1, 2, 3, 4] },
      { name: "Hydrocarbons", years: [3, 1, 2, 3, 3] },
      { name: "Solutions", years: [2, 1, 0, 2, 3] },
      { name: "Electrochemistry", years: [2, 3, 2, 2, 1] },
      { name: "Chemical Kinetics", years: [2, 2, 2, 3, 3] },
      { name: "p-Block Elements (Groups 15 to 18)", years: [2, 1, 0, 3, 2] },
      { name: "d- and f-Block Elements", years: [2, 2, 2, 2, 2] },
      { name: "Coordination Compounds", years: [2, 2, 2, 4, 3] },
      { name: "Haloalkanes and Haloarenes", years: [3, 2, 1, 2, 2] },
      { name: "Alcohols, Phenols and Ethers", years: [2, 3, 3, 3, 1] },
      { name: "Aldehydes, Ketones and Carboxylic Acids", years: [2, 5, 4, 1, 3] },
      { name: "Amines", years: [2, 2, 2, 2, 2] },
      { name: "Biomolecules", years: [1, 1, 1, 1, 2] },
      ],
    },
    {
      name: "Biology",
      items: [
      { name: "The Living World", years: [1, 1, 0, 0, 0] },
      { name: "Biological Classification", years: [1, 2, 0, 2, 1] },
      { name: "Plant Kingdom", years: [5, 3, 3, 1, 5] },
      { name: "Animal Kingdom", years: [4, 3, 2, 4, 4] },
      { name: "Morphology of Flowering Plants", years: [2, 4, 2, 4, 3] },
      { name: "Anatomy of Flowering Plants", years: [3, 3, 3, 3, 1] },
      { name: "Structural Organisation in Animals", years: [4, 4, 6, 4, 4] },
      { name: "Cell: The Unit of Life", years: [4, 2, 3, 4, 4] },
      { name: "Biomolecules", years: [4, 2, 4, 6, 4] },
      { name: "Cell Cycle and Cell Division", years: [5, 4, 6, 4, 1] },
      { name: "Photosynthesis in Higher Plants", years: [3, 3, 3, 3, 2] },
      { name: "Respiration in Plants", years: [0, 2, 2, 2, 1] },
      { name: "Plant Growth and Development", years: [2, 3, 3, 3, 2] },
      { name: "Breathing and Exchange of Gases", years: [2, 2, 1, 2, 1] },
      { name: "Body Fluids and Circulation", years: [2, 3, 2, 2, 1] },
      { name: "Excretory Products and their Elimination", years: [0, 1, 2, 2, 1] },
      { name: "Locomotion and Movement", years: [3, 2, 2, 2, 1] },
      { name: "Neural Control and Coordination", years: [0, 1, 1, 2, 0] },
      { name: "Chemical Coordination and Integration", years: [1, 1, 2, 2, 4] },
      { name: "Sexual Reproduction in Flowering Plants", years: [3, 3, 3, 3, 5] },
      { name: "Human Reproduction", years: [3, 3, 3, 4, 5] },
      { name: "Reproductive Health", years: [3, 2, 3, 2, 1] },
      { name: "Principles of Inheritance and Variation", years: [2, 6, 5, 6, 3] },
      { name: "Molecular Basis of Inheritance", years: [9, 7, 8, 6, 7] },
      { name: "Evolution", years: [2, 2, 1, 4, 1] },
      { name: "Human Health and Disease", years: [1, 2, 3, 5, 5] },
      { name: "Microbes in Human Welfare", years: [1, 1, 0, 1, 4] },
      { name: "Biotechnology: Principles and Processes", years: [6, 5, 4, 5, 6] },
      { name: "Biotechnology and its Applications", years: [6, 3, 2, 4, 4] },
      { name: "Organisms and Populations", years: [5, 3, 4, 2, 4] },
      { name: "Ecosystem", years: [2, 3, 2, 1, 3] },
      { name: "Biodiversity and Conservation", years: [0, 3, 2, 5, 3] },
      ],
    },
    ],
  },
  {
    id: "jee_main",
    label: "JEE Main",
    basis: "Share of each subject's questions over the last five years (2022 to 2026), from a published analysis, by NTA syllabus unit.",
    sourceName: "Careers360: JEE Main high-weightage topics, last 5 years",
    sourceUrl: "https://engineering.careers360.com/articles/high-weightage-topics-for-jee-main-based-on-last-5-years",
    questionsPerSubject: 25,
    subjects: [
      {
        name: "Physics",
        items: [
          { name: "Optics", percent: 8.09 },
          { name: "Electrostatics", percent: 7.52 },
          { name: "Properties of Solids and Liquids", percent: 7.16 },
          { name: "Current Electricity", percent: 6.62 },
          { name: "Electromagnetic Induction and Alternating Currents", percent: 6.11 },
          { name: "Magnetic Effects of Current and Magnetism", percent: 5.89 },
          { name: "Kinematics", percent: 5.83 },
          { name: "Oscillations and Waves", percent: 5.73 },
          { name: "Atoms and Nuclei", percent: 5.56 },
          { name: "Rotational Motion", percent: 4.88 },
          { name: "Laws of Motion", percent: 4.23 },
          { name: "Electronic Devices", percent: 4.12 },
          { name: "Physics and Measurement", percent: 3.88 },
          { name: "Work, Energy and Power", percent: 3.88 },
          { name: "Dual Nature of Matter and Radiation", percent: 3.83 },
          { name: "Thermodynamics", percent: 3.8 },
          { name: "Gravitation", percent: 3.64 },
          { name: "Kinetic Theory of Gases", percent: 3.12 },
          { name: "Electromagnetic Waves", percent: 2.96 },
          { name: "Experimental Skills", percent: 1.38 },
        ],
      },
      {
        name: "Chemistry",
        items: [
          { name: "Organic Compounds Containing Oxygen", percent: 7.61 },
          { name: "Coordination Compounds", percent: 6.28 },
          { name: "Hydrocarbons", percent: 5.67 },
          { name: "p-Block Elements", percent: 5.56 },
          { name: "Redox Reactions and Electrochemistry", percent: 5.5 },
          { name: "Chemical Bonding and Molecular Structure", percent: 5.05 },
          { name: "Solutions", percent: 4.88 },
          { name: "d- and f-Block Elements", percent: 4.68 },
          { name: "Some Basic Principles of Organic Chemistry", percent: 4.64 },
          { name: "Atomic Structure", percent: 4.51 },
          { name: "Some Basic Concepts in Chemistry", percent: 4.33 },
          { name: "Chemical Thermodynamics", percent: 4.3 },
          { name: "Equilibrium", percent: 4.3 },
          { name: "Organic Compounds Containing Nitrogen", percent: 4.3 },
          { name: "Chemical Kinetics", percent: 3.82 },
          { name: "Biomolecules", percent: 3.69 },
          { name: "Purification and Characterisation of Organic Compounds", percent: 3.21 },
          { name: "Classification of Elements and Periodicity", percent: 2.8 },
          { name: "Organic Compounds Containing Halogens", percent: 1.98 },
          { name: "Principles Related to Practical Chemistry", percent: 1.57 },
        ],
      },
      {
        name: "Mathematics",
        items: [
          { name: "Coordinate Geometry", percent: 13.63 },
          { name: "Integral Calculus", percent: 11.23 },
          { name: "Limits, Continuity and Differentiability", percent: 10.77 },
          { name: "Complex Numbers and Quadratic Equations", percent: 7.7 },
          { name: "Three-Dimensional Geometry", percent: 7.53 },
          { name: "Matrices and Determinants", percent: 7.5 },
          { name: "Statistics and Probability", percent: 6.8 },
          { name: "Sequence and Series", percent: 6.53 },
          { name: "Sets, Relations and Functions", percent: 6.23 },
          { name: "Trigonometry", percent: 5.9 },
          { name: "Vector Algebra", percent: 5.8 },
          { name: "Differential Equations", percent: 5.33 },
          { name: "Binomial Theorem", percent: 4.87 },
          { name: "Permutations and Combinations", percent: 4.8 },
        ],
      },
    ],
  },
  {
    id: "cbse12",
    label: "CBSE Class 12",
    basis: "Official marks for each unit in the theory paper (CBSE curriculum 2025–26).",
    sourceName: "CBSE Academic website: curriculum 2025–26",
    sourceUrl: "https://cbseacademic.nic.in/",
    subjects: [
      {
        name: "Physics",
        totalMarks: 70,
        items: [
          { name: "Optics and Electromagnetic Waves", marks: 18, chapters: "Electromagnetic Waves, Ray Optics, Wave Optics" },
          { name: "Magnetism, EMI and Alternating Current", marks: 17, chapters: "Moving Charges and Magnetism, Magnetism and Matter, Electromagnetic Induction, Alternating Current" },
          { name: "Electrostatics and Current Electricity", marks: 16, chapters: "Electric Charges and Fields, Electrostatic Potential and Capacitance, Current Electricity" },
          { name: "Dual Nature, Atoms and Nuclei", marks: 12, chapters: "Dual Nature of Radiation and Matter, Atoms, Nuclei" },
          { name: "Electronic Devices", marks: 7, chapters: "Semiconductor Electronics" },
        ],
      },
      {
        name: "Chemistry",
        totalMarks: 70,
        items: [
          { name: "Electrochemistry", marks: 9 },
          { name: "Aldehydes, Ketones and Carboxylic Acids", marks: 8 },
          { name: "Solutions", marks: 7 },
          { name: "Chemical Kinetics", marks: 7 },
          { name: "d- and f-Block Elements", marks: 7 },
          { name: "Coordination Compounds", marks: 7 },
          { name: "Biomolecules", marks: 7 },
          { name: "Haloalkanes and Haloarenes", marks: 6 },
          { name: "Alcohols, Phenols and Ethers", marks: 6 },
          { name: "Amines", marks: 6 },
        ],
      },
      {
        name: "Mathematics",
        totalMarks: 80,
        items: [
          { name: "Calculus", marks: 35, chapters: "Continuity and Differentiability, Applications of Derivatives, Integrals, Applications of Integrals, Differential Equations" },
          { name: "Vectors and Three-Dimensional Geometry", marks: 14 },
          { name: "Algebra", marks: 10, chapters: "Matrices, Determinants" },
          { name: "Relations and Functions", marks: 8, chapters: "Relations and Functions, Inverse Trigonometric Functions" },
          { name: "Probability", marks: 8 },
          { name: "Linear Programming", marks: 5 },
        ],
      },
      {
        name: "Biology",
        totalMarks: 70,
        items: [
          { name: "Genetics and Evolution", marks: 20, chapters: "Principles of Inheritance and Variation, Molecular Basis of Inheritance, Evolution" },
          { name: "Reproduction", marks: 16, chapters: "Sexual Reproduction in Flowering Plants, Human Reproduction, Reproductive Health" },
          { name: "Biology and Human Welfare", marks: 12, chapters: "Human Health and Disease, Microbes in Human Welfare" },
          { name: "Biotechnology and its Applications", marks: 12 },
          { name: "Ecology and Environment", marks: 10, chapters: "Organisms and Populations, Ecosystem, Biodiversity and its Conservation" },
        ],
      },
    ],
  },
  {
    id: "cbse10",
    label: "CBSE Class 10",
    basis: "Official marks for each unit in the theory paper (CBSE curriculum 2025–26).",
    sourceName: "CBSE Academic website: curriculum 2025–26",
    sourceUrl: "https://cbseacademic.nic.in/",
    subjects: [
      {
        name: "Mathematics",
        totalMarks: 80,
        items: [
          { name: "Algebra", marks: 20, chapters: "Polynomials, Pair of Linear Equations, Quadratic Equations, Arithmetic Progressions" },
          { name: "Geometry", marks: 15, chapters: "Triangles, Circles" },
          { name: "Trigonometry", marks: 12, chapters: "Introduction to Trigonometry, Some Applications of Trigonometry" },
          { name: "Statistics and Probability", marks: 11 },
          { name: "Mensuration", marks: 10, chapters: "Areas Related to Circles, Surface Areas and Volumes" },
          { name: "Number Systems", marks: 6, chapters: "Real Numbers" },
          { name: "Coordinate Geometry", marks: 6 },
        ],
      },
      {
        name: "Science",
        totalMarks: 80,
        items: [
          { name: "Chemical Substances: Nature and Behaviour", marks: 25, chapters: "Chemical Reactions and Equations, Acids, Bases and Salts, Metals and Non-metals, Carbon and its Compounds" },
          { name: "World of Living", marks: 25, chapters: "Life Processes, Control and Coordination, How do Organisms Reproduce?, Heredity" },
          { name: "Effects of Current", marks: 13, chapters: "Electricity, Magnetic Effects of Electric Current" },
          { name: "Natural Phenomena", marks: 12, chapters: "Light: Reflection and Refraction, The Human Eye and the Colourful World" },
          { name: "Natural Resources", marks: 5, chapters: "Our Environment" },
        ],
      },
      {
        name: "Social Science",
        totalMarks: 80,
        items: [
          { name: "History", marks: 20 },
          { name: "Geography", marks: 20 },
          { name: "Political Science", marks: 20 },
          { name: "Economics", marks: 20 },
        ],
      },
    ],
  },
];

export type Band = "high" | "medium" | "low";

export interface RankedItem extends WeightageItem {
  /** The number shown: questions a year (NEET), questions per paper (JEE), marks (CBSE). */
  value: number;
  /** For the bar: share of the subject's biggest item. */
  share: number;
  band: Band;
  /** NEET: asked in every year shown. */
  everyYear: boolean;
}

function itemValue(exam: PastPaperExam, item: WeightageItem): number {
  if (item.years?.length) return item.years.reduce((sum, n) => sum + n, 0) / item.years.length;
  if (typeof item.percent === "number") return ((exam.questionsPerSubject ?? 100) * item.percent) / 100;
  return item.marks ?? 0;
}

/** The subject's chapters, most important first, split into thirds: high, medium, low. */
export function rankSubject(exam: PastPaperExam, subject: WeightageSubject): RankedItem[] {
  const rows = subject.items
    .map((item) => ({ ...item, value: itemValue(exam, item), everyYear: Boolean(item.years?.length && item.years.every((n) => n > 0)) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const top = rows[0]?.value || 1;
  return rows.map((row, index) => ({
    ...row,
    share: row.value / top,
    band: index < Math.ceil(rows.length / 3) ? "high" : index < Math.ceil((rows.length * 2) / 3) ? "medium" : "low",
  }));
}

export function valueLabel(exam: PastPaperExam, item: RankedItem): string {
  if (exam.id === "neet") return `about ${formatOne(item.value)} a year`;
  if (exam.id === "jee_main") return `about ${formatOne(item.value)} per paper`;
  return `${item.value} marks`;
}

function formatOne(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
