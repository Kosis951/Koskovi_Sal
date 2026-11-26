import { normalizeUsername, readStoredAdminUsersSync, type StoredAdminUser } from "@/lib/auth";
import { getPartnerMap } from "@/lib/partners-db";
import { rowBelongsTo, type ScheduleDay } from "@/lib/public-schedule";

// Whose lessons are in the visiting trainer's schedule. A row ("Novák /
// Dvořáková") is a dancer's when:
// - it has the name they wrote in their profile (scheduleName), or
// - it has their surname – and among namesakes also their first name or its
//   initial ("J. Novák") – and they confirmed once that such rows are theirs;
// and it is also their accepted partner's.

// The people of one row: "Novák / Dvořáková", "Novák & Dvořáková", "Novák, Dvořáková".
function people(text: string) {
  return text
    .split(/\s*(?:\/|&|\+|,|;|\s-\s|\sa\s)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();

// Accounts found in the row by surname (and first name among namesakes).
export function matchByName(text: string, users: StoredAdminUser[]) {
  const found = new Set<string>();

  for (const person of people(text)) {
    const bySurname = new Map<string, StoredAdminUser[]>();

    for (const user of users) {
      if (!user.deleted && user.lastName && rowBelongsTo(person, user.lastName)) {
        const key = fold(user.lastName);
        bySurname.set(key, [...(bySurname.get(key) ?? []), user]);
      }
    }

    for (const namesakes of bySurname.values()) {
      if (namesakes.length === 1) {
        found.add(namesakes[0].username);
        continue;
      }

      const words = fold(person).split(/[^\p{L}]+/u).filter(Boolean);
      const byFirstName = namesakes.filter((user) => {
        const first = fold(user.firstName ?? "");
        return first !== "" && (rowBelongsTo(person, user.firstName!) || words.includes(first[0]));
      });

      if (byFirstName.length === 1) {
        found.add(byFirstName[0].username);
      }
    }
  }

  return found;
}

// Accounts (login names) the row belongs to, partners included.
export function rowOwners(text: string, users = readStoredAdminUsersSync(), partners = getPartnerMap()) {
  const byName = matchByName(text, users);
  const owners = new Set<string>();

  for (const user of users) {
    if (user.deleted) {
      continue;
    }

    const own = user.scheduleName?.trim() ? rowBelongsTo(text, user.scheduleName) : false;
    const linked = user.scheduleLink === "confirmed" && byName.has(user.username);

    if (own || linked) {
      owners.add(user.username);
      const partner = partners.get(normalizeUsername(user.username));
      if (partner) {
        owners.add(partner);
      }
    }
  }

  return owners;
}

// "date|start" of the account's lessons in the schedule.
export function myLessonKeys(username: string, days: ScheduleDay[]) {
  const users = readStoredAdminUsersSync();
  const partners = getPartnerMap();
  const key = normalizeUsername(username);
  const keys: string[] = [];

  for (const day of days) {
    for (const row of day.rows) {
      if (row.kind === "lesson" && row.start && day.dateKey) {
        const owners = rowOwners(row.text, users, partners);
        if ([...owners].some((owner) => normalizeUsername(owner) === key)) {
          keys.push(`${day.dateKey}|${row.start}`);
        }
      }
    }
  }

  return keys;
}

// A row the account's surname was found in, while they have not said yet
// whether such rows are theirs ("Is this you?").
export function linkSuggestion(username: string, days: ScheduleDay[]) {
  const users = readStoredAdminUsersSync();
  const user = users.find((item) => !item.deleted && normalizeUsername(item.username) === normalizeUsername(username));

  if (!user?.lastName || user.scheduleLink || user.scheduleName?.trim()) {
    return null;
  }

  for (const day of days) {
    for (const row of day.rows) {
      if (row.kind === "lesson" && matchByName(row.text, users).has(user.username)) {
        return row.text;
      }
    }
  }

  return null;
}
