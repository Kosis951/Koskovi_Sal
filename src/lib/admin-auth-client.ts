export type AdminRole = "admin" | "manager" | "trainer" | "viewer";

export type AdminSession = {
  authenticated: boolean;
  displayName?: string | null;
  role?: AdminRole | null;
  username?: string | null;
};

// Mirrors the server-side check; the server still enforces it on every call.
export function canRoleManageBookings(role: AdminRole | null | undefined) {
  return role === "admin" || role === "manager";
}

// Trainers add hall bookings too, and may change the ones they added.
export function canRoleAddBookings(role: AdminRole | null | undefined) {
  return canRoleManageBookings(role) || role === "trainer";
}

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
