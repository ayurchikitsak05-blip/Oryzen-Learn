import type { MetadataRoute } from "next";

/** "Install as an app" (owner, 27 Nov 2026): Oryzen opens in its own window, from the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/hub",
    name: "Oryzen Learn",
    short_name: "Oryzen",
    description: "Read your books, revise your notes and keep your study streak.",
    start_url: "/hub",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4efe7",
    theme_color: "#f4efe7",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Revise", url: "/revise", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My books", url: "/vaults", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
