import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import StudyRhythmProvider from "@/components/rhythm/StudyRhythmProvider";
import { RHYTHM_BOOT_SCRIPT } from "@/lib/rhythm/persist";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Oryzen Learn — Your personal learning environment",
  description:
    "An AI-powered personal learning environment. Read your textbooks, learn from videos, organize your notebook, and discover how you study best.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="classic"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen overflow-x-hidden bg-canvas font-sans text-ink antialiased selection:bg-selected selection:text-heading"
      >
        <script
          id="oryzen-rhythm-boot"
          dangerouslySetInnerHTML={{ __html: RHYTHM_BOOT_SCRIPT }}
        />
        <StudyRhythmProvider>{children}</StudyRhythmProvider>
      </body>
    </html>
  );
}
