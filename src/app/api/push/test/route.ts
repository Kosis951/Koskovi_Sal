import { NextRequest, NextResponse } from "next/server";
import { isPushEndpoint, sendToEndpoint } from "@/lib/push";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// Sends a test notification to one subscribed device: { endpoint }.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;

  if (!isPushEndpoint(body?.endpoint)) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  if (isRateLimited(`push-test:${body.endpoint}`, 3, 60 * 1000)) {
    return NextResponse.json({ message: "Chvíli počkejte a zkuste to znovu." }, { status: 429 });
  }

  const delivered = await sendToEndpoint(body.endpoint, {
    body: "Upozornění fungují. Takhle vám dáme vědět, když bude sál obsazený.",
    tag: "test",
    title: "Koškovi sál",
    url: "/aplikace",
  });

  return delivered > 0
    ? NextResponse.json({ sent: true })
    : NextResponse.json({ message: "Upozornění se nepodařilo doručit." }, { status: 502 });
}
