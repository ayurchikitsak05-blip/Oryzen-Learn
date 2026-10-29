const STICKERS: Record<string, string> = {
  "read-book": "/collectibles/stickers/read-book.jpg",
  "read-note": "/collectibles/stickers/read-note.jpg",
  "read-mark": "/collectibles/stickers/read-mark.jpg",
  "revise-pass": "/collectibles/stickers/revise-pass.jpg",
  "quiz-saved": "/collectibles/stickers/quiz-saved.jpg",
  "quiz-shorter": "/collectibles/stickers/quiz-shorter.jpg",
  "plan-saved": "/collectibles/stickers/plan-saved.jpg",
  "plan-done": "/collectibles/stickers/plan-done.jpg",
  "subject-mastered": "/collectibles/stickers/subject-mastered.jpg",
  "chapter-one": "/collectibles/stickers/chapter-one.jpg",
  "three-days": "/collectibles/stickers/three-days.jpg",
  "personal-best": "/collectibles/stickers/personal-best.jpg",
};

const BADGES: Record<string, string> = {
  "badge-chapter": "/collectibles/badges/chapter.jpg",
  "badge-note": "/collectibles/badges/note.jpg",
  "badge-revision": "/collectibles/badges/revision.jpg",
  "badge-quiz": "/collectibles/badges/quiz.jpg",
  "badge-plan": "/collectibles/badges/plan.jpg",
  "badge-subject": "/collectibles/badges/subject.jpg",
  "badge-consistent": "/collectibles/badges/consistent.jpg",
  "badge-best": "/collectibles/badges/best.jpg",
};

const GARDEN: Record<string, readonly string[]> = {
  plant: ["/collectibles/garden/plant-1.jpg", "/collectibles/garden/plant-2.jpg", "/collectibles/garden/plant-3.jpg"],
  flower: ["/collectibles/garden/flower-1.jpg", "/collectibles/garden/flower-2.jpg", "/collectibles/garden/flower-3.jpg"],
  stone: ["/collectibles/garden/stone-1.jpg", "/collectibles/garden/stone-2.jpg", "/collectibles/garden/stone-3.jpg"],
  path: ["/collectibles/garden/path.jpg"],
};

export function petArt(accessory: string): string {
  if (accessory === "ribbon") return "/companions/pet-ribbon.jpg";
  if (accessory === "satchel") return "/companions/pet-satchel.jpg";
  return "/companions/pet-none.jpg";
}

export function stickerArt(id: string): string {
  return STICKERS[id] ?? STICKERS["read-book"];
}

export function badgeArt(id: string): string {
  return BADGES[id] ?? BADGES["badge-chapter"];
}

export function gardenArt(kind: string, index: number): string {
  const frames = GARDEN[kind] ?? GARDEN.plant;
  return frames[index % frames.length];
}

export function CollectibleImage({
  src,
  label,
  earned = true,
}: {
  src: string;
  label: string;
  earned?: boolean;
}) {
  return (
    <>
      <img
        src={src}
        alt=""
        data-earned={earned ? "true" : "false"}
        className={`h-28 w-28 rounded-2xl object-cover ${earned ? "" : "opacity-80"}`}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
