export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protege todas las rutas excepto: login, api/*, _next/*, favicon.ico
  matcher: ["/((?!login|api|_next/static|_next/image|favicon\\.ico).*)"],
};
