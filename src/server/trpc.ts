// src/server/trpc.ts
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";

export async function createContext() {
  const session = await auth();
  return { session };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: ctx.session } });
});
