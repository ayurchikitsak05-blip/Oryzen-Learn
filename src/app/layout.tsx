import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-screen overflow-x-hidden bg-canvas font-sans text-ink antialiased selection:bg-selected selection:text-heading"
      >
        {children}
      </body>
    </html>
  );
}
