import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "libpro_auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  const validPassword = process.env.SITE_PASSWORD;

  if (!password || password !== validPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(COOKIE_NAME, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
