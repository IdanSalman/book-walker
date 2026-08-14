import { redirect } from "next/navigation";

import { categoryFromSlug } from "@/lib/categories";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) redirect("/library");

  redirect(`/library?category=${slug}`);
}
