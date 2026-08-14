"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  isDisplayNameTaken,
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/user-name";

export type OnboardingState = {
  error?: string;
};

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireUser();
  const rawName = formData.get("name");

  if (typeof rawName !== "string") {
    return { error: "Name is required." };
  }

  const validationError = validateDisplayName(rawName);
  if (validationError) {
    return { error: validationError };
  }

  const name = normalizeDisplayName(rawName);

  if (await isDisplayNameTaken(name, session.user.id)) {
    return { error: "That name is already taken. Try another." };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        onboardingComplete: true,
      },
    });
  } catch {
    return { error: "That name is already taken. Try another." };
  }

  revalidatePath("/account");
  revalidatePath("/dashboard");

  return {};
}
