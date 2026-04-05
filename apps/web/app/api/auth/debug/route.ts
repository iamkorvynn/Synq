import { NextResponse } from "next/server";

import { auth, getAuthConfigSnapshot } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const authConfig = getAuthConfigSnapshot();

  return NextResponse.json({
    ok: true,
    configured: {
      ...authConfig.configured,
      postgresUrl: Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    },
    sources: authConfig.sources,
    consistency: authConfig.consistency,
    hints: authConfig.hints,
    session: session?.user?.email
      ? {
          email: session.user.email,
          name: session.user.name ?? "",
        }
      : null,
  });
}
