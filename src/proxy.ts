import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// NOTE: keep this the only proxy/middleware file. With a root middleware.ts next
// to it, `next build` used one and `next dev` mixed both, sending /api to login.
// /api routes check the session themselves (or, like the GitHub webhook, have
// none), so they stay out of the matcher.
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon\\.ico).*)"],
};
