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
import { readDataTextSync } from "@/lib/runtime-storage";

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
// viewer: read-only access to the camp schedule.
export type AdminRole = "admin" | "manager" | "viewer";

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
  lessonFilter?: LessonFilter;
  passwordHash?: string;
  role?: AdminRole;
  updatedAt?: string;
  updatedBy?: string;
  username: string;
};

export type AdminAccess = {
  lessonFilter: LessonFilter;
  role: AdminRole;
  username: string;
};

const adminUsersFile = "admin-users.json";

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
    if (user.passwordHash) {
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
    secure: process.env.NODE_ENV === "production",
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
    lessonFilter: getStoredLessonFilter(username, storedUsers),
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

  if (storedUser?.role === "manager" || storedUser?.role === "viewer") {
    return storedUser.role;
  }

  if (readOnlyUsernames.has(normalizedUsername)) {
    return "viewer";
  }

  // Accounts limited to part of the camp schedule are dancers or trainers
  // looking at their lessons, not hall managers.
  if (sanitizeLessonFilter(storedUser?.lessonFilter).type !== "all") {
    return "viewer";
  }

  return "manager";
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

function getStoredLessonFilter(username: string, storedUsers: StoredAdminUser[]) {
  const normalizedUsername = normalizeUsername(username);
  const storedUser = storedUsers.find(
    (user) => normalizeUsername(user.username) === normalizedUsername,
  );

  return sanitizeLessonFilter(storedUser?.lessonFilter);
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
  return role === "manager" || role === "viewer" ? role : undefined;
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

function readStoredAdminUsersSync() {
  try {
    const content = readDataTextSync(adminUsersFile);
    const parsed = JSON.parse(content) as StoredAdminUser[];

    return Array.isArray(parsed)
      ? parsed.filter((user) => user.username)
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
