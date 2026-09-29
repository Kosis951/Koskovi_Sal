import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  createAdminSession,
  getAdminSessionCookieOptions,
  normalizeUsername,
  verifyAdminPassword,
} from "@/lib/auth";
import {
  clearLoginFailures,
  getClientIp,
  getLoginBlockSeconds,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

const maxCredentialLength = 200;

export async function POST(request: NextRequest) {
  const { password, username } = (await request.json()) as {
    password?: unknown;
    username?: unknown;
  };

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password ||
    username.length > maxCredentialLength ||
    password.length > maxCredentialLength
  ) {
    return invalidCredentialsResponse();
  }

  const ip = getClientIp(request.headers);
  const normalizedUsername = normalizeUsername(username);
  const blockSeconds = getLoginBlockSeconds(ip, normalizedUsername);

  if (blockSeconds > 0) {
    return NextResponse.json(
      {
        message: `Příliš mnoho neúspěšných pokusů. Zkus to znovu za ${Math.ceil(
          blockSeconds / 60,
        )} min.`,
      },
      { headers: { "Retry-After": String(blockSeconds) }, status: 429 },
    );
  }

  if (!(await verifyAdminPassword(username, password))) {
    recordLoginFailure(ip, normalizedUsername);
    return invalidCredentialsResponse();
  }

  clearLoginFailures(normalizedUsername);

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(
    adminSessionCookie,
    createAdminSession(username),
    getAdminSessionCookieOptions(),
  );

  return response;
}

function invalidCredentialsResponse() {
  return NextResponse.json(
    { message: "Nesprávné přihlašovací údaje." },
    { status: 401 },
  );
}
