import { randomUUID } from "node:crypto";
import { createNameLookup, normalizeUsername, readStoredAdminUsersSync } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Two accounts of a dancing couple: after one asks and the other accepts,
// both see the lessons of either of them. Only names are ever shown to the
// other side – no e-mail or phone.

type PartnershipRow = {
  created_at: string;
  decided_at: string | null;
  from_user: string;
  id: string;
  status: "accepted" | "pending";
  to_user: string;
};

export type PartnerPerson = { id: string; name: string; username: string };

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();

function rows() {
  return getDb().prepare("SELECT * FROM partnerships").all() as PartnershipRow[];
}

function same(left: string, right: string) {
  return normalizeUsername(left) === normalizeUsername(right);
}

// Every account with an accepted partner → that partner.
export function getPartnerMap() {
  const map = new Map<string, string>();

  for (const row of rows()) {
    if (row.status === "accepted") {
      map.set(normalizeUsername(row.from_user), row.to_user);
      map.set(normalizeUsername(row.to_user), row.from_user);
    }
  }

  return map;
}

export function getPartnerships(username: string) {
  const names = createNameLookup();
  const person = (id: string, other: string): PartnerPerson => ({ id, name: names.name(other), username: other });
  const mine = rows().filter((row) => same(row.from_user, username) || same(row.to_user, username));
  const accepted = mine.find((row) => row.status === "accepted");

  return {
    incoming: mine
      .filter((row) => row.status === "pending" && same(row.to_user, username))
      .map((row) => person(row.id, row.from_user)),
    outgoing: mine
      .filter((row) => row.status === "pending" && same(row.from_user, username))
      .map((row) => person(row.id, row.to_user)),
    partner: accepted
      ? person(accepted.id, same(accepted.from_user, username) ? accepted.to_user : accepted.from_user)
      : null,
  };
}

// Suggestions while typing: every typed word starts a word of the first name
// or surname ("dvo", "jan dvo", "dvorakova"), case and diacritics do not
// matter. Names only, surname matches first.
export function searchPartners(username: string, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);

  if (words.join("").length < 2) {
    return [];
  }

  const names = createNameLookup();

  return readStoredAdminUsersSync()
    .filter((user) => !user.deleted && !same(user.username, username))
    .map((user) => {
      const first = fold(user.firstName ?? "");
      const last = fold(user.lastName ?? "");
      const parts = `${first} ${last}`.split(/[\s-]+/).filter(Boolean);
      const matches = last !== "" && words.every((word) => parts.some((part) => part.startsWith(word)));
      return { first, last, matches, surnameFirst: words.some((word) => last.startsWith(word)), user };
    })
    .filter((row) => row.matches)
    .sort((left, right) =>
      Number(right.surnameFirst) - Number(left.surnameFirst) ||
      left.last.localeCompare(right.last, "cs") ||
      left.first.localeCompare(right.first, "cs"),
    )
    .slice(0, 8)
    .map(({ user }) => ({ name: names.name(user.username), username: user.username }));
}

export function requestPartnership(from: string, to: string) {
  const target = readStoredAdminUsersSync().find((user) => !user.deleted && same(user.username, to));

  if (!target || same(from, to)) {
    return { error: "Tenhle účet nejde najít." };
  }

  const all = rows();
  const busy = (name: string) =>
    all.some((row) => row.status === "accepted" && (same(row.from_user, name) || same(row.to_user, name)));

  if (busy(from)) {
    return { error: "Už máš partnera/partnerku. Nejdřív partnerství ukonči." };
  }

  if (busy(to)) {
    return { error: "Tenhle tanečník už partnera/partnerku má." };
  }

  // They already asked: asking back accepts it.
  const reverse = all.find((row) => row.status === "pending" && same(row.from_user, to) && same(row.to_user, from));

  if (reverse) {
    return respondPartnership(reverse.id, from, "accept");
  }

  if (all.some((row) => row.status === "pending" && same(row.from_user, from) && same(row.to_user, to))) {
    return { error: "Žádost už je odeslaná." };
  }

  getDb()
    .prepare("INSERT INTO partnerships (id, from_user, to_user, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .run(randomUUID(), from, target.username, new Date().toISOString());

  return { message: "Žádost o partnerství je odeslaná." };
}

// accept / decline (the asked one), cancel (the asking one), end (either).
export function respondPartnership(id: string, username: string, action: string) {
  const row = rows().find((item) => item.id === id);

  if (!row) {
    return { error: "Žádost už neplatí." };
  }

  const db = getDb();
  const isFrom = same(row.from_user, username);
  const isTo = same(row.to_user, username);

  if (action === "accept" && row.status === "pending" && isTo) {
    db.transaction(() => {
      db.prepare("UPDATE partnerships SET status = 'accepted', decided_at = ? WHERE id = ?").run(new Date().toISOString(), id);
      // Other open requests of either of them are no longer needed.
      for (const other of rows()) {
        const involved = [other.from_user, other.to_user].some((name) => same(name, row.from_user) || same(name, row.to_user));
        if (other.status === "pending" && other.id !== id && involved) {
          db.prepare("DELETE FROM partnerships WHERE id = ?").run(other.id);
        }
      }
    })();
    return { message: "Jste partneři. Lekce vidíte společně." };
  }

  if ((action === "decline" && row.status === "pending" && isTo) || (action === "cancel" && row.status === "pending" && isFrom)) {
    db.prepare("DELETE FROM partnerships WHERE id = ?").run(id);
    return { message: action === "decline" ? "Žádost je odmítnutá." : "Žádost je zrušená." };
  }

  if (action === "end" && row.status === "accepted" && (isFrom || isTo)) {
    db.prepare("DELETE FROM partnerships WHERE id = ?").run(id);
    return { message: "Partnerství je ukončené." };
  }

  return { error: "Tohle teď nejde." };
}
