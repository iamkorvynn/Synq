import { NextResponse } from "next/server";

import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const authSecret = process.env.AUTH_SECRET ?? "";
  const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
  const authGoogleId = process.env.AUTH_GOOGLE_ID ?? "";
  const authGoogleSecret = process.env.AUTH_GOOGLE_SECRET ?? "";
  const legacyGoogleId = process.env.GOOGLE_CLIENT_ID ?? "";
  const legacyGoogleSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const activeGoogleSource =
    authGoogleId && authGoogleSecret
      ? "authjs"
      : legacyGoogleId && legacyGoogleSecret
        ? "legacy"
        : "missing";

  return NextResponse.json({
    ok: true,
    configured: {
      authSecret: Boolean(authSecret || nextAuthSecret),
      googleClientId: Boolean(authGoogleId || legacyGoogleId),
      googleClientSecret: Boolean(authGoogleSecret || legacyGoogleSecret),
      postgresUrl: Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    },
    sources: {
      activeGoogleSource,
      authSecretSource: authSecret
        ? "AUTH_SECRET"
        : nextAuthSecret
          ? "NEXTAUTH_SECRET"
          : "missing",
    },
    consistency: {
      googleIdsMatch:
        !authGoogleId || !legacyGoogleId ? null : authGoogleId === legacyGoogleId,
      googleSecretsMatch:
        !authGoogleSecret || !legacyGoogleSecret
          ? null
          : authGoogleSecret === legacyGoogleSecret,
      authSecretsMatch:
        !authSecret || !nextAuthSecret ? null : authSecret === nextAuthSecret,
      authGooglePairReady: Boolean(authGoogleId && authGoogleSecret),
      legacyGooglePairReady: Boolean(legacyGoogleId && legacyGoogleSecret),
    },
    session: session?.user?.email
      ? {
          email: session.user.email,
          name: session.user.name ?? "",
        }
      : null,
  });
}
