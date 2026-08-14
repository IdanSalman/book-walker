import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/",
    "/login",
    "/onboarding",
    "/dashboard/:path*",
    "/category/:path*",
    "/books/:path*",
    "/library/:path*",
    "/account/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/read/:path*",
  ],
};
