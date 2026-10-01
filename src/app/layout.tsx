import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { AppSplash } from "@/components/pwa/app-splash";
import {
  installCaptureScript,
  splashScript,
  standaloneZoomScript,
} from "@/components/pwa/install-capture";
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
  applicationName: "Koškovi sál",
  // Installed on an iPhone/iPad home screen. Not "black-translucent": with
  // the page running under the status bar, iOS 26+ draws its edge blur over
  // the top of the header. With "default" the status bar is solid, tinted by
  // themeColor (the header colour), and the page starts below it. iOS reads
  // this only when the app is added to the home screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Koškovi sál",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#003758",
  // Lets the installed app use the whole screen; safe-area insets keep the
  // content clear of the notch and the home indicator.
  viewportFit: "cover",
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
              ${standaloneZoomScript}
              ${splashScript}
              ${installCaptureScript}
            `,
          }}
        />
        <AppSplash />
        {/* For apps installed before the status bar change above: a fixed box
            over the status bar area makes iOS show its colour instead of
            blurring the header. Zero height everywhere else. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[var(--app-safe-top)] bg-header"
        />
        {children}
        <PullToRefresh />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
