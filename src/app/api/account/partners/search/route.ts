import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { searchPartners } from "@/lib/partners-db";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// ?q=surname – accounts with that surname, by name only (no e-mail, phone).
export async function GET(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  if (isRateLimited(`partner-search:${auth.access.username}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ message: "Příliš mnoho hledání, zkus to za chvíli." }, { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";

  return NextResponse.json({ people: searchPartners(auth.access.username, query.slice(0, 60)) });
}
