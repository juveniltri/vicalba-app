import { createCallerFactory, createContext } from "./trpc";
import { appRouter } from "./routers/_app";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  const ctx = await createContext();
  return createCaller(ctx);
}
