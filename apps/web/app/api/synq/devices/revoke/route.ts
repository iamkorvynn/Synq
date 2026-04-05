import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Device revocation is not available in Google-auth mode." },
    { status: 400 },
  );
}
