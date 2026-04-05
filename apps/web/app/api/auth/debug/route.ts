import { NextResponse } from "next/server";

import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  return NextResponse.json({
    ok: true,
    configured: {
      authSecret: Boolean(
        process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
      ),
      googleClientId: Boolean(
        process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID,
      ),
      googleClientSecret: Boolean(
        process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      ),
      postgresUrl: Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    },
    session: session?.user?.email
      ? {
          email: session.user.email,
          name: session.user.name ?? "",
        }
      : null,
  });
}
