import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Device approval is not needed in Google-auth mode." },
    { status: 400 },
  );
}
