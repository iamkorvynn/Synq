import { NextResponse } from "next/server";

import { getReadiness } from "@/lib/server/synq-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getReadiness());
}
