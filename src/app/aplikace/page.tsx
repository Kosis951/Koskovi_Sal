import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import QRCode from "qrcode";
import { AppInstallPage } from "@/components/pwa/app-install-page";
import { getAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aplikace | Koškovi",
  description: "Kalendář sálu Koškovi jako aplikace v telefonu – zdarma, bez obchodu s aplikacemi.",
};

export default async function AplikacePage() {
  const access = getAdminAccess(await cookies());
  const qrSvg = await QRCode.toString(await getPageUrl(), {
    color: { dark: "#003758", light: "#ffffff" },
    errorCorrectionLevel: "M",
    margin: 1,
    type: "svg",
  });

  return (
    <AppInstallPage
      initialSession={access ? { role: access.role, username: access.username } : null}
      qrSvg={qrSvg}
    />
  );
}

// Address for the QR code, so a computer can hand the page over to a phone.
// APP_URL wins; otherwise the address the visitor used (behind nginx via the
// forwarded headers).
async function getPageUrl() {
  if (process.env.APP_URL) {
    return new URL("/aplikace", process.env.APP_URL).toString();
  }

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const rawHost = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  // Only a plain host name ends up in the QR code.
  const host = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(rawHost) ? rawHost : "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : isLocal
      ? "http"
      : "https";

  return `${protocol}://${host}/aplikace`;
}
