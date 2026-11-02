import { getDb } from "@/lib/db";
import { nameKey } from "@/lib/public-schedule";

// Phone numbers of people in the visiting trainer's schedule, by the name
// written there (the schedule has no accounts). Only hall managers see them.

export function getContactPhones() {
  return getDb()
    .prepare("SELECT name, phone FROM contact_phones ORDER BY name")
    .all() as Array<{ name: string; phone: string }>;
}

// An empty phone removes the number.
export function setContactPhone(name: string, phone: string, actor: string) {
  const key = nameKey(name);

  if (!phone) {
    getDb().prepare("DELETE FROM contact_phones WHERE name_key = ?").run(key);
    return;
  }

  getDb()
    .prepare(
      `INSERT INTO contact_phones (name_key, name, phone, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name_key) DO UPDATE SET name = excluded.name, phone = excluded.phone,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(key, name.replace(/\s+/g, " ").trim(), phone, new Date().toISOString(), actor);
}
