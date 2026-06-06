import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { obtenerMetricas } from "@/lib/system/metrics";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(obtenerMetricas());
  } catch {
    return NextResponse.json({ error: "no disponible" }, { status: 500 });
  }
}
