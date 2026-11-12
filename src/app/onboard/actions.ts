"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { PublishInputSchema, slugify, type PublishInput } from "@/lib/catalog";
import { fromCents, toCents } from "@/lib/money";

const imageFor = (sku: string) => `https://picsum.photos/seed/${encodeURIComponent(sku.toLowerCase())}/800/800`;

export async function publishStore(input: PublishInput): Promise<{ error: string } | void> {
  const parsed = PublishInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some product data is invalid. Re-run the import and try again." };
  const { storeName, result } = parsed.data;

  const base = slugify(storeName) || "store";
  let slug = base;

  try {
    const db = getDb();
    for (let i = 2; await db.store.findUnique({ where: { slug }, select: { id: true } }); i++) {
      slug = `${base}-${i}`;
    }

    await db.store.create({
      data: {
        slug,
        name: storeName,
        tagline: result.store.tagline,
        description: result.store.description,
        agentReadinessScore: result.agentReadinessScore,
        readinessReport: { score: result.agentReadinessScore, fixes: result.fixes },
        products: {
          create: result.products.map((p) => ({
            sku: p.sku,
            title: p.title,
            description: p.description,
            agentSummary: p.agentSummary,
            price: fromCents(toCents(p.price)),
            stock: p.stock,
            tags: p.tags,
            attributes: Object.fromEntries(Object.entries(p.attributes).filter(([, v]) => v)),
            imageUrl: p.imageUrl ?? imageFor(p.sku),
          })),
        },
      },
    });
  } catch (err) {
    console.error("[publish] failed", err);
    return { error: "Couldn't save the store. Check the database connection and try again." };
  }

  redirect(`/dashboard/${slug}`);
}
