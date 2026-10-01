import {
  getAdminRole,
  hashPassword,
  listAdminUsernames,
  normalizeUsername,
  readStoredAdminUsersSync,
  type AdminRole,
  type StoredAdminUser,
} from "@/lib/auth";
import { getDb } from "@/lib/db";

let usersQueue = Promise.resolve();

export async function getAdminUsers() {
  const storedUsers = await readStoredUsers();
  const storedByUsername = new Map(
    storedUsers.map((user) => [normalizeUsername(user.username), user]),
  );
  const usernames = new Set([
    ...listAdminUsernames(),
    ...storedUsers.filter((user) => !user.deleted).map((user) => user.username),
  ]);

  return [...usernames]
    .map((username) => {
      const storedUser = storedByUsername.get(normalizeUsername(username));

      return {
        isStored: Boolean(storedUser?.passwordHash),
        role: getAdminRole(username, storedUsers),
        username: storedUser?.username ?? username,
      };
    })
    .sort((left, right) => left.username.localeCompare(right.username, "cs-CZ"));
}

export async function upsertAdminUserPassword(input: {
  actor: string;
  password: string;
  username: string;
}) {
  return withUsersLock(async () => {
    const now = new Date().toISOString();
    const normalizedUsername = normalizeUsername(input.username);
    const users = await readStoredUsers();
    const existingIndex = users.findIndex(
      (user) => normalizeUsername(user.username) === normalizedUsername,
    );
    const previousUser = existingIndex >= 0 ? users[existingIndex] : null;
    const isRestored = Boolean(previousUser?.deleted);
    const nextUser: StoredAdminUser = {
      createdAt: isRestored ? now : previousUser?.createdAt ?? now,
      createdBy: isRestored ? input.actor : previousUser?.createdBy ?? input.actor,
      // Setting a password (re)activates a previously deleted account.
      deleted: false,
      displayName: previousUser?.displayName,
      partnerName: previousUser?.partnerName,
      lessonFilter: previousUser?.lessonFilter,
      passwordHash: await hashPassword(input.password),
      role: isRestored ? undefined : previousUser?.role,
      updatedAt: now,
      updatedBy: input.actor,
      username: previousUser?.username ?? input.username.trim(),
    };

    if (existingIndex >= 0) {
      users[existingIndex] = nextUser;
    } else {
      users.push(nextUser);
    }

    await writeStoredUsers(users);

    return {
      isStored: true,
      username: nextUser.username,
    };
  });
}

export type UserProfile = {
  displayName?: string;
  partnerName?: string;
};

export function getUserProfile(username: string): UserProfile {
  const key = normalizeUsername(username);
  const user = readStoredAdminUsersSync().find(
    (item) => !item.deleted && normalizeUsername(item.username) === key,
  );

  return { displayName: user?.displayName, partnerName: user?.partnerName };
}

// The account's own profile. Works for accounts from the server
// configuration too: they get a stored row without a password, which leaves
// their configured password in force.
export async function updateUserProfile(username: string, profile: UserProfile) {
  return withUsersLock(async () => {
    const now = new Date().toISOString();
    const key = normalizeUsername(username);
    const previousUser = (await readStoredUsers()).find(
      (user) => normalizeUsername(user.username) === key,
    );

    await writeStoredUsers([
      {
        ...previousUser,
        createdAt: previousUser?.createdAt ?? now,
        createdBy: previousUser?.createdBy ?? username,
        displayName: profile.displayName,
        partnerName: profile.partnerName,
        updatedAt: now,
        updatedBy: username,
        username: previousUser?.username ?? username,
      },
    ]);

    return profile;
  });
}

const invitedByPrefix = "pozvánka: ";
const maxInvitedUsers = 300;

// Self-registration through a trainer's invite link: a new read-only account.
// Never touches an existing name – not even a deleted account or one from the
// server configuration – so a registration cannot take over anybody's account.
export async function registerInvitedUser(input: {
  invitedBy: string;
  password: string;
  username: string;
}) {
  return withUsersLock(async () => {
    const normalizedUsername = normalizeUsername(input.username);
    const users = await readStoredUsers();
    const isTaken =
      users.some((user) => normalizeUsername(user.username) === normalizedUsername) ||
      listAdminUsernames().some((username) => normalizeUsername(username) === normalizedUsername);

    if (isTaken) {
      return { error: "taken" as const };
    }

    if (
      users.filter((user) => !user.deleted && user.createdBy?.startsWith(invitedByPrefix)).length >=
      maxInvitedUsers
    ) {
      return { error: "full" as const };
    }

    const now = new Date().toISOString();
    const username = input.username.trim();

    await writeStoredUsers([
      {
        createdAt: now,
        createdBy: `${invitedByPrefix}${input.invitedBy}`,
        deleted: false,
        passwordHash: await hashPassword(input.password),
        role: "viewer",
        updatedAt: now,
        updatedBy: username,
        username,
      },
    ]);

    return { username };
  });
}

export async function upsertAdminUserRole(input: {
  actor: string;
  role: AdminRole;
  username: string;
}) {
  return withUsersLock(async () => {
    const now = new Date().toISOString();
    const normalizedUsername = normalizeUsername(input.username);
    const users = await readStoredUsers();
    const existingIndex = users.findIndex(
      (user) => normalizeUsername(user.username) === normalizedUsername,
    );
    const previousUser = existingIndex >= 0 ? users[existingIndex] : null;
    const nextUser: StoredAdminUser = {
      ...previousUser,
      createdAt: previousUser?.createdAt ?? now,
      createdBy: previousUser?.createdBy ?? input.actor,
      role: input.role,
      updatedAt: now,
      updatedBy: input.actor,
      username: previousUser?.username ?? input.username.trim(),
    };

    if (existingIndex >= 0) {
      users[existingIndex] = nextUser;
    } else {
      users.push(nextUser);
    }

    await writeStoredUsers(users);

    return { role: getAdminRole(nextUser.username, users), username: nextUser.username };
  });
}

// The account can no longer log in and its sessions stop working right away.
// Accounts from server configuration stay hidden until a new password is set.
export async function deleteAdminUser(input: { actor: string; username: string }) {
  return withUsersLock(async () => {
    const normalizedUsername = normalizeUsername(input.username);
    const users = await readStoredUsers();
    const existing = users.find(
      (user) => normalizeUsername(user.username) === normalizedUsername,
    );
    const exists =
      (existing && !existing.deleted) ||
      listAdminUsernames().some((username) => normalizeUsername(username) === normalizedUsername);

    if (!exists) {
      return false;
    }

    await writeStoredUsers([
      {
        createdAt: existing?.createdAt,
        createdBy: existing?.createdBy,
        deleted: true,
        updatedAt: new Date().toISOString(),
        updatedBy: input.actor,
        username: existing?.username ?? input.username.trim(),
      },
    ]);

    return true;
  });
}

async function readStoredUsers() {
  return readStoredAdminUsersSync();
}

async function writeStoredUsers(users: StoredAdminUser[]) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO admin_users (username_key, username, password_hash, role, lesson_filter,
      deleted, created_at, created_by, updated_at, updated_by, display_name, partner_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username_key) DO UPDATE SET
      username = excluded.username, password_hash = excluded.password_hash,
      role = excluded.role, lesson_filter = excluded.lesson_filter,
      deleted = excluded.deleted, display_name = excluded.display_name,
      partner_name = excluded.partner_name,
      created_at = excluded.created_at, created_by = excluded.created_by,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `);

  db.transaction(() => {
    for (const user of users) {
      upsert.run(
        normalizeUsername(user.username),
        user.username,
        user.passwordHash ?? null,
        user.role ?? null,
        user.lessonFilter ? JSON.stringify(user.lessonFilter) : null,
        user.deleted ? 1 : 0,
        user.createdAt ?? null,
        user.createdBy ?? null,
        user.updatedAt ?? null,
        user.updatedBy ?? null,
        user.displayName ?? null,
        user.partnerName ?? null,
      );
    }
  })();
}

function withUsersLock<T>(operation: () => Promise<T>) {
  const nextOperation = usersQueue.then(operation, operation);
  usersQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
