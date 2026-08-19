import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";
import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function resolveRole(email: string | null | undefined): Role {
  if (!email) return "USER";
  return adminEmails().includes(email.toLowerCase()) ? "ADMIN" : "USER";
}

async function syncUserToken(token: {
  id?: string;
  role?: Role;
  name?: string | null;
  onboardingComplete?: boolean;
  hideAdultContent?: boolean;
  hideReadTitles?: boolean;
  defaultReadingMode?: string;
}) {
  if (!token.id) return token;

  const dbUser = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: {
      role: true,
      email: true,
      name: true,
      onboardingComplete: true,
      hideAdultContent: true,
      hideReadTitles: true,
      defaultReadingMode: true,
    },
  });

  if (!dbUser) return token;

  const role = resolveRole(dbUser.email);
  if (role !== dbUser.role) {
    await prisma.user.update({
      where: { id: token.id as string },
      data: { role },
    });
  }

  token.role = role;
  token.name = dbUser.name;
  token.onboardingComplete = dbUser.onboardingComplete;
  token.hideAdultContent = dbUser.hideAdultContent;
  token.hideReadTitles = dbUser.hideReadTitles;
  token.defaultReadingMode = dbUser.defaultReadingMode;
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }

      if (token.id) {
        await syncUserToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as Role) ?? "USER";
        session.user.name = (token.name as string | null) ?? null;
        session.user.onboardingComplete = Boolean(token.onboardingComplete);
        session.user.hideAdultContent =
          typeof token.hideAdultContent === "boolean"
            ? token.hideAdultContent
            : true;
        session.user.hideReadTitles = Boolean(token.hideReadTitles);
        session.user.defaultReadingMode =
          typeof token.defaultReadingMode === "string"
            ? token.defaultReadingMode
            : "auto";
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { onboardingComplete: true },
      });

      const role = resolveRole(user.email);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          role,
          ...(!dbUser?.onboardingComplete ? { name: null } : {}),
        },
      });
    },
  },
});
