import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/login-rate-limit";
import {
  deleteNativeDevice,
  getNativeDeviceTopics,
  parseTopics,
  saveNativeDevice,
  sendToNativeDevice,
} from "@/lib/push";
import { getRelayUrl, isApnsToken, isFcmToken, isRelayEndpoint } from "@/lib/push-relay";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// Notifications for the native apps, delivered by the relay on the NAS.
// Like web push, anyone may subscribe: the notifications only contain what
// the public calendar shows.
//   POST { platform: "ios", token, topics },
//        { platform: "android", token, topics } (Firebase) or
//        { platform: "android", endpoint, topics } (ntfy) – subscribe or change
//        topics (no topics = unsubscribe); `test: true` sends a test.
//   PUT { token } / { endpoint } – which topics this device receives.

function deviceKey(body: Record<string, unknown> | null) {
  if (body?.platform === "ios" && isApnsToken(body.token)) {
    return { platform: "ios" as const, token: body.token };
  }

  if (body?.platform === "android" && isFcmToken(body.token)) {
    return { platform: "android" as const, token: body.token };
  }

  if (body?.platform === "android" && isRelayEndpoint(body.endpoint)) {
    return { platform: "android" as const, token: body.endpoint };
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!getRelayUrl()) {
    return NextResponse.json({ message: "Upozornění pro aplikaci nejsou na serveru zapnutá." }, { status: 503 });
  }

  if (isRateLimited(`push-native:${getClientIp(request.headers)}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ message: "Příliš mnoho pokusů, zkuste to později." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const device = deviceKey(body);

  if (!device) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  const topics = parseTopics(body?.topics);

  if (topics.length === 0) {
    console.info(`[push] aplikace ${device.platform} …${device.token.slice(-6)}: odhlášeno`);
    deleteNativeDevice(device.token);
    return NextResponse.json({ subscribed: false, topics });
  }

  if (!saveNativeDevice(device.token, device.platform, topics)) {
    return NextResponse.json({ message: "Kapacita upozornění je plná." }, { status: 507 });
  }

  // In `pm2 logs`: which phone (end of its token) subscribed to what.
  console.info(`[push] aplikace ${device.platform} …${device.token.slice(-6)}: ${topics.join(", ")}`);

  if (body?.test === true) {
    const delivered = await sendToNativeDevice(device.token, {
      body: "Upozornění fungují. Takhle vám dáme vědět, když bude sál obsazený.",
      tag: "test",
      title: "Koškovi sál",
    });

    console.info(`[push] aplikace ${device.platform} …${device.token.slice(-6)}: zkouška ${delivered ? "doručena" : "NEDORUČENA"}`);

    if (delivered === 0) {
      return NextResponse.json({ message: "Zkušební upozornění se nepodařilo doručit." }, { status: 502 });
    }
  }

  return NextResponse.json({ subscribed: true, topics });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token =
    isApnsToken(body?.token) || isFcmToken(body?.token)
      ? body.token
      : isRelayEndpoint(body?.endpoint)
        ? body.endpoint
        : null;

  if (!token) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  const topics = getNativeDeviceTopics(token);

  return NextResponse.json({
    available: Boolean(getRelayUrl()),
    subscribed: topics !== null,
    topics: topics ?? [],
  });
}
