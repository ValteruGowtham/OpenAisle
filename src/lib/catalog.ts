import { z } from "zod";

/** Product shape the LLM extracts from a raw catalog. */
export const ImportedProductSchema = z.object({
  sku: z.string().describe("Short uppercase SKU, e.g. KH-SCF-001. Invent one if missing."),
  title: z.string().describe("Clean, descriptive product title in Title Case."),
  description: z.string().describe("1-3 sentence buyer-facing description."),
  agentSummary: z
    .string()
    .describe("One dense factual line for AI shopping agents: what it is, material, color, size, price-relevant facts."),
  price: z.number().describe("Unit price in the store currency (USD), e.g. 42.5. Convert INR at 1 USD = 84 INR."),
  stock: z.number().int().describe("Units in stock. Use 0 if sold out, 5 if unknown."),
  tags: z.array(z.string()).describe("3-6 lowercase search tags."),
  attributes: z.object({
    material: z.string().nullable(),
    color: z.string().nullable(),
    size: z.string().nullable(),
    origin: z.string().nullable(),
  }),
  imageUrl: z.string().nullable().describe("Image URL if one is present in the input, else null."),
});

export const ImportResultSchema = z.object({
  store: z.object({
    tagline: z.string().describe("Short tagline for the store, under 70 characters."),
    description: z.string().describe("2 sentence store description."),
  }),
  products: z.array(ImportedProductSchema),
  agentReadinessScore: z
    .number()
    .describe("0-100: how well the ORIGINAL raw catalog supports AI shopping agents (clear titles, prices, stock, attributes, images, policies)."),
  fixes: z.array(z.string()).describe("Up to 5 concrete, specific fixes the merchant should make."),
});

export type ImportedProduct = z.infer<typeof ImportedProductSchema>;
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const ImportRequestSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  rawCatalog: z.string().trim().min(10).max(20_000),
});

/** What the merchant publishes: the reviewed preview plus the store name. */
export const PublishInputSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  result: ImportResultSchema.extend({
    products: z
      .array(
        ImportedProductSchema.extend({
          price: z.number().positive().max(100_000),
          stock: z.number().int().min(0).max(100_000),
        }),
      )
      .min(1)
      .max(50),
    agentReadinessScore: z.number().int().min(0).max(100),
    fixes: z.array(z.string()).max(5),
  }),
});

export type PublishInput = z.infer<typeof PublishInputSchema>;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Clean up LLM output: unique SKUs, cent-rounded prices, clamped score, max 5 fixes. */
export function normalizeImport(result: ImportResult): ImportResult {
  const seen = new Set<string>();
  const products = result.products
    .filter((p) => p.title.trim() && Number.isFinite(p.price) && p.price > 0)
    .slice(0, 50)
    .map((p, i) => {
      let sku = (p.sku || `SKU-${i + 1}`).toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32);
      if (!sku || seen.has(sku)) sku = `${sku || "SKU"}-${i + 1}`;
      seen.add(sku);
      return {
        ...p,
        sku,
        title: p.title.trim(),
        price: Math.round(p.price * 100) / 100,
        stock: Math.max(0, Math.round(p.stock)),
        tags: [...new Set(p.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))].slice(0, 8),
        imageUrl: p.imageUrl?.startsWith("http") ? p.imageUrl : null,
        attributes: Object.fromEntries(
          Object.entries(p.attributes).map(([k, v]) => [k, v?.trim() || null]),
        ) as ImportedProduct["attributes"],
      };
    });
  return {
    ...result,
    products,
    agentReadinessScore: Math.max(0, Math.min(100, Math.round(result.agentReadinessScore))),
    fixes: result.fixes.filter(Boolean).slice(0, 5),
  };
}
