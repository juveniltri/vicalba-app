import { prisma } from "@/lib/prisma";

export type TokenSesion = { sub?: string; iniciadaEn?: unknown };

// The JWT alone stays valid until it expires; checking the user on every
// request is what makes deleting a user or changing a password log them out.
export async function sesionVigente(token: TokenSesion): Promise<boolean> {
  const { sub, iniciadaEn } = token;
  if (!sub || typeof iniciadaEn !== "number") return false;
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { sesionesDesde: true },
  });
  if (!user) return false;
  return user.sesionesDesde.getTime() <= iniciadaEn;
}
