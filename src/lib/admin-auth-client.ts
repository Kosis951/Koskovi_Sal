import type { Permissions } from "@/lib/permissions";

export type AdminRole = "admin" | "manager" | "trainer" | "viewer";

export type AdminSession = {
  authenticated: boolean;
  displayName?: string | null;
  // What the account may do (permissions.ts); checks use `can`.
  permissions?: Permissions | null;
  role?: AdminRole | null;
  // A trainer request from the registration still waits.
  trainerRequest?: "pending" | "declined" | null;
  username?: string | null;
};

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, username }),
  });

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };

    throw new Error(data.message ?? "Přihlášení se nepodařilo.");
  }

  return response;
}

export async function logoutAdmin() {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getAdminSession() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });

  return (await response.json()) as AdminSession;
}
