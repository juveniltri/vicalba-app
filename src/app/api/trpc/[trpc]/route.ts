import { captureException } from "@sentry/nextjs";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(),
    // tRPC turns thrown errors into responses, so onRequestError never sees
    // them. Expected ones (NOT_FOUND, BAD_REQUEST…) are not bugs.
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        captureException(error.cause ?? error, { tags: { trpc: path } });
      }
    },
  });

export { handler as GET, handler as POST };
