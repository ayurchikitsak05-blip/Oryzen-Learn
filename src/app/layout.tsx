import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oryzen Learn — Adaptive Intelligence & Focus Reader",
  description:
    "Oryzen Learn combines a Focus Book Reader, synchronized video lectures, and adaptive intelligence for calm, focused study.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-100 selection:text-zinc-950"
      >
        {children}
      </body>
    </html>
  );
}
