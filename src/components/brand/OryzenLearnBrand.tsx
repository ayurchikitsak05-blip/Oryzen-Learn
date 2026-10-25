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
      <span className="text-left">
        <span className="block whitespace-nowrap font-display text-sm tracking-tight text-heading">
          Oryzen Learn
        </span>
        {subtitle ? (
          <span className="hidden max-md:block whitespace-nowrap text-[11px] text-muted lg:block">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl pr-1 transition-opacity hover:opacity-90 lg:gap-2.5 lg:pr-2"
    >
      {lockup}
    </Link>
  );
}
