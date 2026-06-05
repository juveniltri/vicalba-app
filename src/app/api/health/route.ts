import { NextResponse } from "next/server";
import { comprobarSalud } from "@/lib/health";

export async function GET() {
  const result = await comprobarSalud();
  return NextResponse.json(
    { ...result, timestamp: new Date().toISOString() },
    { status: result.status === "ok" ? 200 : 503 },
  );
}
