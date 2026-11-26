import { NextResponse } from "next/server";
import { readAuditLog } from "@/lib/audit-log";
import { requireStatsViewer } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireStatsViewer();

  if (auth.error) {
    return auth.error;
  }

  const { role, username } = auth.access;
  const entries = await readAuditLog(100);

  if (role !== "admin") {
    return NextResponse.json({
      entries: entries.filter(
        (entry) => entry.actor === username && entry.action === "booking.delete",
      ),
    });
  }

  return NextResponse.json({ entries });
}
