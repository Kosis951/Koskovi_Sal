import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The apps for iPhone and Android (and how to use the web as one) are on
// their own site on the NAS (nas/push-relay/site).
const appsSite = process.env.APPS_SITE_URL || "https://app.tkkoskovi.cz";

export default function AplikacePage() {
  redirect(appsSite);
}
