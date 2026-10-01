import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ProfilePage } from "@/components/profile/profile-page";
import { getUserProfile } from "@/lib/admin-users-db";
import { getAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Můj profil | Koškovi" };

export default async function ProfileRoute() {
  const access = getAdminAccess(await cookies());

  return (
    <ProfilePage
      initialProfile={access ? getUserProfile(access.username) : {}}
      initialSession={access ? { role: access.role, username: access.username } : null}
    />
  );
}
