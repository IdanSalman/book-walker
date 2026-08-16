import { AppNav } from "@/components/nav";
import { AdminTabs } from "@/components/admin-tabs";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <>
      <AppNav session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 space-y-3">
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/30 px-4 py-2 text-sm text-violet-200">
            Admin area — manage the shared book catalog and the websites it fetches
            from.
          </div>
          <AdminTabs />
        </div>
        {children}
      </main>
    </>
  );
}
