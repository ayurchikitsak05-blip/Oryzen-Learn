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
      <Image
        src="/logo.png"
        alt="Oryzen Learn"
        width={48}
        height={48}
        className="h-12 w-12 rounded-2xl object-cover"
      />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Oryzen Learn
        </span>
        {subtitle ? (
          <span className="block truncate text-[11px] text-zinc-500">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-full pr-2 transition-opacity hover:opacity-90"
    >
      {lockup}
    </Link>
  );
}
