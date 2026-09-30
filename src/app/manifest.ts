import type { MetadataRoute } from "next";

// Makes the site installable as an app (Android "Install app", iOS "Add to
// Home Screen"). Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Koškovi – sál",
    short_name: "Koškovi sál",
    description: "Kalendář a rezervace tanečního sálu TK Koškovi.",
    lang: "cs",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#003758",
    theme_color: "#003758",
    categories: ["sports", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Správa",
        url: "/admin",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
