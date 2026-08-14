import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

function configuredProviders(): Provider[] {
  const providers: Provider[] = [];

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    );
  }

  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    providers.push(
      GitHub({
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET,
      }),
    );
  }

  return providers;
}

export const authConfig = {
  pages: {
    signIn: "/login",
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
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
