import { NextRequest, NextResponse } from "next/server";

async function hashToken(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API through
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("auth_token")?.value;
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    // No password configured — allow access
    return NextResponse.next();
  }

  const expected = await hashToken(
    sitePassword + (process.env.AUTH_SECRET_SALT || "")
  );

  if (token === expected) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
