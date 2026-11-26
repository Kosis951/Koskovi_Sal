// What an account may do, section by section. The roles (dancer, trainer,
// hall management, main administrator) are presets; the main administrator
// can change any account's sections in Správa → Uživatelé. Shared by the
// server (which enforces it) and the pages (which only hide what is not
// allowed). The apps get the same object from /api/auth/session.

export type Permissions = {
  // The hall calendar: everyone sees it; "own" adds events and changes them,
  // "all" also every other event, the regular trainings and the holidays.
  hall: "view" | "own" | "all";
  // Trainers' lesson calendars: "view" sees the trainers and books lessons,
  // "trainer" has an own calendar, "all" manages every trainer's calendar.
  lessons: "none" | "view" | "trainer" | "all";
  // The visiting trainer's schedule: "edit" writes and publishes it and
  // handles the dancers' requests.
  schedule: "view" | "edit";
  // Accounts: their sections, approving trainers, passwords.
  users: "none" | "manage";
  // The overview and the history of changes in Správa.
  stats: "none" | "view";
};

export type PermissionRole = "admin" | "manager" | "trainer" | "viewer";

export const permissionSections: Array<{
  key: keyof Permissions;
  label: string;
  options: Array<{ label: string; value: string }>;
}> = [
  {
    key: "hall",
    label: "Kalendář sálu",
    options: [
      { label: "Vidí", value: "view" },
      { label: "Přidává své akce", value: "own" },
      { label: "Upravuje vše", value: "all" },
    ],
  },
  {
    key: "lessons",
    label: "Lekce",
    options: [
      { label: "Nevidí", value: "none" },
      { label: "Vidí trenéry", value: "view" },
      { label: "Vlastní kalendář (trenér)", value: "trainer" },
      { label: "Spravuje všechny", value: "all" },
    ],
  },
  {
    key: "schedule",
    label: "Rozpis",
    options: [
      { label: "Vidí", value: "view" },
      { label: "Upravuje", value: "edit" },
    ],
  },
  {
    key: "users",
    label: "Uživatelé",
    options: [
      { label: "Nevidí", value: "none" },
      { label: "Spravuje", value: "manage" },
    ],
  },
  {
    key: "stats",
    label: "Přehled a historie",
    options: [
      { label: "Nevidí", value: "none" },
      { label: "Vidí", value: "view" },
    ],
  },
];

const presets: Record<PermissionRole, Permissions> = {
  admin: { hall: "all", lessons: "all", schedule: "edit", stats: "view", users: "manage" },
  manager: { hall: "all", lessons: "view", schedule: "edit", stats: "view", users: "none" },
  trainer: { hall: "own", lessons: "trainer", schedule: "view", stats: "none", users: "none" },
  viewer: { hall: "view", lessons: "view", schedule: "view", stats: "none", users: "none" },
};

export function rolePermissions(role: PermissionRole | null | undefined): Permissions {
  return { ...presets[role ?? "viewer"] };
}

// Stored or sent permissions, each section checked; anything missing or
// unknown comes from `fallback`.
export function sanitizePermissions(value: unknown, fallback: Permissions): Permissions {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result = { ...fallback };

  for (const section of permissionSections) {
    const wanted = input[section.key];

    if (typeof wanted === "string" && section.options.some((option) => option.value === wanted)) {
      (result as Record<string, string>)[section.key] = wanted;
    }
  }

  return result;
}

// The role preset the permissions match exactly, if any (for the label).
export function presetOf(permissions: Permissions): PermissionRole | null {
  return (
    (Object.keys(presets) as PermissionRole[]).find((role) =>
      permissionSections.every((section) => presets[role][section.key] === permissions[section.key]),
    ) ?? null
  );
}

// --- Checks (for the server and the pages alike) ---

type Holder = { permissions?: Permissions | null; role?: PermissionRole | null } | null | undefined;

// Older sessions in the apps send only the role.
function of(holder: Holder) {
  return holder?.permissions ?? rolePermissions(holder?.role ?? "viewer");
}

export const can = {
  addHallEvents: (holder: Holder) => Boolean(holder) && of(holder).hall !== "view",
  manageHall: (holder: Holder) => Boolean(holder) && of(holder).hall === "all",
  seeLessons: (holder: Holder) => Boolean(holder) && of(holder).lessons !== "none",
  haveLessonCalendar: (holder: Holder) => Boolean(holder) && of(holder).lessons === "trainer",
  manageAllLessons: (holder: Holder) => Boolean(holder) && of(holder).lessons === "all",
  editSchedule: (holder: Holder) => Boolean(holder) && of(holder).schedule === "edit",
  manageUsers: (holder: Holder) => Boolean(holder) && of(holder).users === "manage",
  seeStats: (holder: Holder) => Boolean(holder) && of(holder).stats === "view",
  // Any part of Správa.
  administer: (holder: Holder) =>
    Boolean(holder) &&
    (of(holder).hall === "all" ||
      of(holder).schedule === "edit" ||
      of(holder).users === "manage" ||
      of(holder).stats === "view"),
};
