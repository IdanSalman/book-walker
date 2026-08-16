import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      onboardingComplete: boolean;
      hideAdultContent: boolean;
      hideReadTitles: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    name?: string | null;
    onboardingComplete?: boolean;
    hideAdultContent?: boolean;
    hideReadTitles?: boolean;
  }
}
