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
      deleted, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username_key) DO UPDATE SET
      username = excluded.username, password_hash = excluded.password_hash,
      role = excluded.role, lesson_filter = excluded.lesson_filter,
      deleted = excluded.deleted,
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
