import type { Metadata } from "next";
import { cookies } from "next/headers";
import { InvitePage } from "@/components/lessons/invite-page";
import { createNameLookup, getAdminAccess } from "@/lib/auth";
import { findTrainerByInvite } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const metadata: Metadata = {
  title: "Pozvánka | Koškovi",
  // Not for search engines: only people the trainer sends it to should come.
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

// A trainer's invite link, /pozvanka/<trainer's account>: the only way to
// create an account.
export default async function InviteRoute({ params }: { params: Promise<{ token: string }> }) {
  const token = safeDecode((await params).token);
  const access = getAdminAccess(await cookies());
  const trainer = await findTrainerByInvite(token);

  return (
    <InvitePage
      initialSession={access ? { role: access.role, username: access.username } : null}
      token={token}
      trainer={trainer}
      trainerName={trainer ? createNameLookup().name(trainer) : null}
    />
  );
}
