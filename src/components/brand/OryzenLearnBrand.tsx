import Image from "next/image";
import Link from "next/link";

interface OryzenLearnBrandProps {
  subtitle?: string;
  href?: string;
}

export default function OryzenLearnBrand({
  subtitle,
  href = "/",
}: OryzenLearnBrandProps) {
  const lockup = (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-[#FFFDFC] p-0.5">
        <Image
          src="/logo.png"
          alt="Oryzen Learn"
          width={48}
          height={48}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate font-display text-sm tracking-tight text-heading">
          Oryzen Learn
        </span>
        {subtitle ? (
          <span className="block truncate text-[11px] text-muted">{subtitle}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <Link
      href={href}
      className="inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-2 transition-opacity hover:opacity-90"
    >
      {lockup}
    </Link>
  );
}
