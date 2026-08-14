/**
 * Bootstrap the sole user as admin and mark onboarding complete.
 * Usage: node scripts/bootstrap-admin.mjs
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.$queryRaw`
    SELECT id, email, name FROM "User"
  `;

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  for (const user of users) {
    const fallbackName =
      user.name ??
      user.email?.split("@")[0]?.slice(0, 32) ??
      `reader-${user.id.slice(-6)}`;

    await prisma.$executeRaw`
      UPDATE "User"
      SET
        role = 'ADMIN'::"Role",
        "onboardingComplete" = true,
        name = COALESCE(name, ${fallbackName})
      WHERE id = ${user.id}
    `;
    console.log(`Set admin + onboarding complete: ${user.email ?? user.id}`);
  }

  const adminEmail = users[0]?.email;
  if (adminEmail) {
    const envPath = resolve(__dirname, "../.env");
    let env = readFileSync(envPath, "utf8");
    if (/^ADMIN_EMAILS=.*/m.test(env)) {
      env = env.replace(/^ADMIN_EMAILS=.*/m, `ADMIN_EMAILS="${adminEmail}"`);
    } else {
      env += `\nADMIN_EMAILS="${adminEmail}"\n`;
    }
    writeFileSync(envPath, env, "utf8");
    console.log(`Updated ADMIN_EMAILS to ${adminEmail}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
