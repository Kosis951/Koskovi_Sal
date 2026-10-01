import type { Metadata } from "next";
import { cookies } from "next/headers";
import { InvitePage } from "@/components/lessons/invite-page";
import { getAdminAccess } from "@/lib/auth";
import { findTrainerByInvite } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pozvánka | Koškovi",
  // The link is a secret; keep it out of search engines and referrers.
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

// A trainer's invite link: the only way to create an account.
export default async function InviteRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = getAdminAccess(await cookies());

  return (
    <InvitePage
      initialSession={access ? { role: access.role, username: access.username } : null}
      token={token}
      trainer={await findTrainerByInvite(token)}
    />
  );
}
