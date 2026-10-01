import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getDb } from "@/lib/db";

export const adminSessionCookie = "koskovi_admin_session";
export const adminSessionMaxAgeSeconds = 60 * 60 * 8;

const devPassword = "koskovi-admin";
const devSecret = "local-development-session-secret";
const mainAdminUsername = "kosis";
const readOnlyUsernames = new Set(["tkkoskovi"]);
const sessionVersion = "v2";
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keyLength: number,
) => Promise<Buffer>;
// Verified against when the username is unknown, so a login attempt takes the
// same time whether or not the account exists.
const dummyPasswordHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

// admin: everything incl. user management; manager: hall bookings;
// viewer: read-only (dancers; may request lessons); trainer: may add hall
// bookings and change the ones they added, plus an own lesson calendar (see
// lessons-db.ts).
export type AdminRole = "admin" | "manager" | "trainer" | "viewer";

type AdminCredential = {
  password?: string;
  passwordHash?: string;
  username: string;
};

export type LessonFilter = {
  type: "all" | "dancer" | "trainer";
  value: string;
};

export type StoredAdminUser = {
  createdAt?: string;
  createdBy?: string;
  // Also hides accounts defined in server configuration.
  deleted?: boolean;
  displayName?: string;
  // Usual dance partner, offered when requesting a lesson as a couple.
  partnerName?: string;
  lessonFilter?: LessonFilter;
  passwordHash?: string;
  role?: AdminRole;
  updatedAt?: string;
  updatedBy?: string;
  username: string;
};

export type AdminAccess = {
  role: AdminRole;
  username: string;
};


function getAdminCredentials(
  storedUsers: StoredAdminUser[] = readStoredAdminUsersSync(),
): AdminCredential[] {
  const credentials = [
    {
      username: process.env.ADMIN_USERNAME ?? mainAdminUsername,
      password: process.env.ADMIN_PASSWORD_HASH
        ? undefined
        : process.env.ADMIN_PASSWORD ??
          (process.env.NODE_ENV === "development" ? devPassword : undefined),
      passwordHash: process.env.ADMIN_PASSWORD_HASH,
    },
    {
      username: "JB",
      passwordHash: process.env.ADMIN_JB_PASSWORD_HASH,
    },
    {
      username: "sarka",
      passwordHash: process.env.ADMIN_SARKA_PASSWORD_HASH,
    },
    {
      username: "Pepe",
      passwordHash: process.env.ADMIN_PEPE_PASSWORD_HASH,
    },
    {
      username: "TKKoskovi",
      passwordHash: process.env.ADMIN_TKKOSKOVI_PASSWORD_HASH,
    },
  ];

  const mergedCredentials = new Map<string, AdminCredential>();

  for (const credential of credentials) {
    mergedCredentials.set(normalizeUsername(credential.username), credential);
  }

  for (const user of storedUsers) {
    if (user.deleted) {
      mergedCredentials.delete(normalizeUsername(user.username));
    } else if (user.passwordHash) {
      mergedCredentials.set(normalizeUsername(user.username), {
        username: user.username,
        passwordHash: user.passwordHash,
      });
    }
  }

  return [...mergedCredentials.values()];
}

function findCredential(
  username: string,
  storedUsers?: StoredAdminUser[],
) {
  const normalizedUsername = normalizeUsername(username);

  return getAdminCredentials(storedUsers).find(
    (credential) =>
      normalizeUsername(credential.username) === normalizedUsername &&
      Boolean(credential.passwordHash || credential.password),
  );
}

function getSessionSecret() {
  const secret =
    process.env.ADMIN_SESSION_SECRET ??
    (process.env.NODE_ENV === "development" ? devSecret : "");

  if (!secret) {
    throw new Error("V produkci chybi promenna ADMIN_SESSION_SECRET.");
  }

  return secret;
}

export function createAdminSession(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const credential = findCredential(normalizedUsername);

  if (!credential) {
    throw new Error("Uživatel neexistuje.");
  }

  const sessionId = randomUUID();
  const expiresAt = String(
    Math.floor(Date.now() / 1000) + adminSessionMaxAgeSeconds,
  );
  const signature = signSession(
    sessionId,
    normalizedUsername,
    expiresAt,
    getCredentialFingerprint(credential),
  );

  return [
    sessionVersion,
    sessionId,
    Buffer.from(normalizedUsername).toString("base64url"),
    expiresAt,
    signature,
  ].join(".");
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: adminSessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax" as const,
    // Production cookies need HTTPS. SESSION_COOKIE_SECURE=false allows a
    // temporary test over plain http://; never leave it off on a public site.
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.SESSION_COOKIE_SECURE !== "false",
  };
}

export async function verifyAdminPassword(username: string, password: string) {
  const credential = findCredential(username);

  if (!credential) {
    await verifyPasswordHash(password, dummyPasswordHash);
    return false;
  }

  if (credential.passwordHash) {
    return verifyPasswordHash(password, credential.passwordHash);
  }

  return safeCompare(password, credential.password ?? "");
}

export function getAdminAccessFromSession(value?: string): AdminAccess | null {
  if (!value) {
    return null;
  }

  const [version, sessionId, encodedUsername, expiresAt, signature] =
    value.split(".");

  if (
    version !== sessionVersion ||
    !sessionId ||
    !encodedUsername ||
    !expiresAt ||
    !signature
  ) {
    return null;
  }

  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) * 1000 <= Date.now()) {
    return null;
  }

  const username = Buffer.from(encodedUsername, "base64url").toString("utf8");
  const storedUsers = readStoredAdminUsersSync();
  const credential = findCredential(username, storedUsers);

  // The fingerprint ties the session to the current password, so changing a
  // password (or removing the account) logs out every existing session.
  if (
    !credential ||
    !safeCompare(
      signature,
      signSession(
        sessionId,
        username,
        expiresAt,
        getCredentialFingerprint(credential),
      ),
    )
  ) {
    return null;
  }

  return {
    role: getAdminRole(username, storedUsers),
    username,
  };
}

export function getAdminAccess(cookies: ReadonlyRequestCookies) {
  return getAdminAccessFromSession(cookies.get(adminSessionCookie)?.value);
}

export function canManageBookings(access: AdminAccess | null) {
  return access?.role === "admin" || access?.role === "manager";
}

// Trainers may add hall bookings and change the ones they added themselves.
export function canAddBookings(access: AdminAccess | null) {
  return canManageBookings(access) || access?.role === "trainer";
}

export function isMainAdmin(access: AdminAccess | null) {
  return access?.role === "admin";
}

export function getAdminRole(
  username: string,
  storedUsers: StoredAdminUser[] = readStoredAdminUsersSync(),
): AdminRole {
  const normalizedUsername = normalizeUsername(username);

  if (normalizedUsername === mainAdminUsername) {
    return "admin";
  }

  const storedUser = storedUsers.find(
    (user) => normalizeUsername(user.username) === normalizedUsername,
  );

  if (
    storedUser?.role === "manager" ||
    storedUser?.role === "viewer" ||
    storedUser?.role === "trainer"
  ) {
    return storedUser.role;
  }

  if (readOnlyUsernames.has(normalizedUsername)) {
    return "viewer";
  }

  // Accounts that were limited to part of the (now removed) camp schedule
  // belong to dancers or trainers, not hall managers.
  if (sanitizeLessonFilter(storedUser?.lessonFilter).type !== "all") {
    return "viewer";
  }

  return "manager";
}

// Names for showing people: the profile name where one is set, otherwise the
// account name as its owner typed it.
export function createNameLookup(storedUsers: StoredAdminUser[] = readStoredAdminUsersSync()) {
  const byKey = new Map(
    storedUsers
      .filter((user) => !user.deleted)
      .map((user) => [normalizeUsername(user.username), user]),
  );

  return {
    name(username: string) {
      const user = byKey.get(normalizeUsername(username));

      return user?.displayName || user?.username || username;
    },
  };
}

export function listAdminUsernames() {
  return getAdminCredentials().map((credential) => credential.username);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");

  return scryptAsync(password, salt, 64).then(
    (key) => `scrypt$${salt}$${key.toString("hex")}`,
  );
}

function getCredentialFingerprint(credential: AdminCredential) {
  return createHash("sha256")
    .update(credential.passwordHash ?? credential.password ?? "")
    .digest("hex")
    .slice(0, 32);
}

function signSession(
  sessionId: string,
  username: string,
  expiresAt: string,
  credentialFingerprint: string,
) {
  return createHmac("sha256", getSessionSecret())
    .update(
      [sessionVersion, sessionId, username, expiresAt, credentialFingerprint].join(
        ".",
      ),
    )
    .digest("hex");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyPasswordHash(password: string, passwordHash: string) {
  const [scheme, salt, key] = passwordHash.split("$");

  if (scheme !== "scrypt" || !salt || !key) {
    return false;
  }

  const expectedKey = Buffer.from(key, "hex");
  const actualKey = await scryptAsync(password, salt, expectedKey.length);

  if (actualKey.length !== expectedKey.length) {
    return false;
  }

  return timingSafeEqual(actualKey, expectedKey);
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("cs-CZ");
}

export function sanitizeRole(role: unknown): AdminRole | undefined {
  return role === "manager" || role === "viewer" || role === "trainer" ? role : undefined;
}

export function sanitizeLessonFilter(filter?: Partial<LessonFilter> | null) {
  const type = filter?.type;
  const value = filter?.value?.trim() ?? "";

  if (type !== "dancer" && type !== "trainer") {
    return { type: "all", value: "" } satisfies LessonFilter;
  }

  if (!value) {
    return { type: "all", value: "" } satisfies LessonFilter;
  }

  return { type, value } satisfies LessonFilter;
}

type AdminUserRow = {
  created_at: string | null;
  created_by: string | null;
  deleted: number;
  display_name: string | null;
  partner_name: string | null;
  lesson_filter: string | null;
  password_hash: string | null;
  role: AdminRole | null;
  updated_at: string | null;
  updated_by: string | null;
  username: string;
};

// Synchronous on purpose: session checks run on every request and
// better-sqlite3 reads are fast and blocking-free for this data size.
export function readStoredAdminUsersSync(): StoredAdminUser[] {
  const rows = getDb().prepare("SELECT * FROM admin_users").all() as AdminUserRow[];

  return rows.map((row) => ({
    createdAt: row.created_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    deleted: row.deleted === 1,
    displayName: row.display_name ?? undefined,
    partnerName: row.partner_name ?? undefined,
    lessonFilter: row.lesson_filter ? (JSON.parse(row.lesson_filter) as LessonFilter) : undefined,
    passwordHash: row.password_hash ?? undefined,
    role: row.role ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    username: row.username,
  }));
}
