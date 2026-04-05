import { NextRequest, NextResponse } from "next/server";

import { getAuthConfigSnapshot } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSetCookies(headers: Headers) {
  if ("getSetCookie" in headers && typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function joinCookies(...cookieSets: string[][]) {
  return cookieSets
    .flat()
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/chat`;
  const authConfig = getAuthConfigSnapshot();

  if (!authConfig.authSecret || !authConfig.googleConfig) {
    return NextResponse.redirect(`${callbackUrl}?error=Configuration`);
  }

  if (
    authConfig.consistency.googleIdsMatch === false ||
    authConfig.consistency.googleSecretsMatch === false ||
    authConfig.consistency.authSecretsMatch === false
  ) {
    return NextResponse.redirect(`${callbackUrl}?error=EnvConflict`);
  }

  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (!csrfResponse.ok) {
    return NextResponse.redirect(`${callbackUrl}?error=Configuration`);
  }

  const csrfCookies = getSetCookies(csrfResponse.headers);
  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };

  if (!csrfPayload.csrfToken) {
    return NextResponse.redirect(`${callbackUrl}?error=Configuration`);
  }

  const signInResponse = await fetch(`${origin}/api/auth/signin/google`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: joinCookies(
        request.headers.get("cookie") ? [request.headers.get("cookie")!] : [],
        csrfCookies,
      ),
    },
    body: new URLSearchParams({
      csrfToken: csrfPayload.csrfToken,
      callbackUrl,
      json: "true",
    }),
    cache: "no-store",
  });

  const location = signInResponse.headers.get("location");
  const response = NextResponse.redirect(
    location ?? `${callbackUrl}?error=Configuration`,
  );

  for (const cookie of [...csrfCookies, ...getSetCookies(signInResponse.headers)]) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
