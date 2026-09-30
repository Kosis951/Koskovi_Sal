import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// BR Firma, the club's typeface (as on tkkoskovi.cz): Black for headings,
// Regular/Medium for text.
const firma = localFont({
  variable: "--font-firma",
  display: "swap",
  src: [
    { path: "./fonts/br-firma-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/br-firma-medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/br-firma-semibold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/br-firma-bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/br-firma-black.woff2", weight: "900", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Koškovi | Dostupnost sálu",
  description: "Rezervační kalendář Koškovi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      className={`${firma.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var savedTheme = localStorage.getItem("koskovi-theme");
                var pragueHour = Number(new Intl.DateTimeFormat("cs-CZ", {
                  hour: "numeric",
                  hour12: false,
                  timeZone: "Europe/Prague"
                }).formatToParts(new Date()).find(function (part) {
                  return part.type === "hour";
                })?.value || "12");
                var timeDefaultDark = pragueHour < 6 || pragueHour >= 17;
                var isDark = savedTheme ? savedTheme === "dark" : timeDefaultDark;
                document.documentElement.classList.toggle("dark", isDark);
                document.documentElement.dataset.theme = isDark ? "dark" : "light";
              } catch (_) {}
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
