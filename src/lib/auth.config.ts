import type { NextAuthConfig } from "next-auth";
import { customFetch } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

/**
 * Next.js patches global `fetch` (caching + `redirect: "manual"`). Auth.js
 * oauth4webapi then fails with `TypeError: fetch failed` and Auth.js reports
 * a Configuration error. Bypass that by using an uncached follow-redirect fetch.
 */
const oauthFetch: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : error;
    console.error("[auth] OAuth fetch failed", { url, cause });
    throw error;
  }
};

function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        authorization: {
          url: "https://accounts.google.com/o/oauth2/v2/auth",
          params: { scope: "openid email profile" },
        },
        token: "https://oauth2.googleapis.com/token",
        userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
        [customFetch]: oauthFetch,
      }),
    );
  }

  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    providers.push(
      GitHub({
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET,
        [customFetch]: oauthFetch,
      }),
    );
  }

  return providers;
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: configuredProviders(),
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/category") ||
        pathname.startsWith("/books") ||
        pathname.startsWith("/library") ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/read");

      if (isProtected && !isLoggedIn) {
        return false;
      }

      if ((pathname === "/login" || pathname === "/") && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      if (pathname === "/settings") {
        return Response.redirect(new URL("/account", request.nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        session.user.name = (token.name as string | null) ?? null;
        session.user.onboardingComplete = Boolean(token.onboardingComplete);
        session.user.hideAdultContent = Boolean(token.hideAdultContent ?? true);
        session.user.hideReadTitles = Boolean(token.hideReadTitles);
        session.user.defaultReadingMode =
          typeof token.defaultReadingMode === "string"
            ? token.defaultReadingMode
            : "auto";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
