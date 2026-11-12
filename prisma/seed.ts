import { config } from "dotenv";
import { createPgAdapter } from "../src/lib/pg-adapter";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });

const SLUG = "kaveri-handlooms";
const img = (sku: string) => `https://picsum.photos/seed/${sku.toLowerCase()}/800/800`;

type SeedProduct = {
  sku: string;
  title: string;
  description: string;
  agentSummary: string;
  price: string;
  stock: number;
  tags: string[];
  attributes: { material: string; color: string; dimensions: string; origin: string; care: string };
};

const products: SeedProduct[] = [
  {
    sku: "KH-SCF-001",
    title: "Mulberry Silk Ikat Scarf: Saffron & Teal",
    description:
      "Hand-dyed double ikat from Pochampally, woven on a pit loom. Light enough for spring, rich enough for evenings out.",
    agentSummary: "Pure mulberry silk ikat scarf, saffron/teal, 180x55 cm, handwoven Pochampally, $48.",
    price: "48.00",
    stock: 24,
    tags: ["scarf", "silk", "ikat", "saffron", "teal", "gift"],
    attributes: { material: "100% mulberry silk", color: "Saffron & teal", dimensions: "180 x 55 cm", origin: "Pochampally, Telangana", care: "Dry clean only" },
  },
  {
    sku: "KH-SCF-002",
    title: "Kota Doria Cotton Scarf: Blush Pink",
    description:
      "Airy checked Kota Doria weave from Rajasthan. Sheer, breathable and easy to wear year-round.",
    agentSummary: "Kota Doria cotton-silk blend scarf, blush pink, sheer checked weave, 190x60 cm, $26.",
    price: "26.00",
    stock: 40,
    tags: ["scarf", "cotton", "kota doria", "pink", "lightweight", "summer"],
    attributes: { material: "80% cotton, 20% silk", color: "Blush pink", dimensions: "190 x 60 cm", origin: "Kota, Rajasthan", care: "Gentle hand wash, cold" },
  },
  {
    sku: "KH-SCF-003",
    title: "Bandhani Tie-Dye Silk Scarf: Crimson",
    description:
      "Thousands of hand-tied dots by Kutch artisans in classic crimson and gold. A heritage piece that's easy to style.",
    agentSummary: "Gaji silk bandhani tie-dye scarf, crimson with gold dots, 170x50 cm, Kutch, $38.",
    price: "38.00",
    stock: 2,
    tags: ["scarf", "silk", "bandhani", "tie-dye", "red", "festive"],
    attributes: { material: "Gaji silk", color: "Crimson & gold", dimensions: "170 x 50 cm", origin: "Kutch, Gujarat", care: "Dry clean only" },
  },
  {
    sku: "KH-STL-001",
    title: "Pashmina-Blend Kani Stole: Charcoal",
    description:
      "Soft pashmina-wool blend with a woven Kani paisley border. Warm, featherlight and made for winter layering.",
    agentSummary: "Pashmina-wool blend stole with Kani paisley border, charcoal grey, 200x70 cm, Kashmir, $96.",
    price: "96.00",
    stock: 12,
    tags: ["stole", "pashmina", "wool", "kani", "grey", "winter"],
    attributes: { material: "70% pashmina, 30% merino wool", color: "Charcoal grey", dimensions: "200 x 70 cm", origin: "Srinagar, Kashmir", care: "Dry clean only" },
  },
  {
    sku: "KH-STL-002",
    title: "Handspun Khadi Stole: Natural Ecru",
    description:
      "Hand-spun, handwoven khadi cotton with a raw, textured hand-feel. Undyed and unbleached.",
    agentSummary: "Handspun khadi cotton stole, undyed natural ecru, 200x70 cm, eco/plastic-free, $32.",
    price: "32.00",
    stock: 35,
    tags: ["stole", "khadi", "cotton", "natural", "eco", "unisex"],
    attributes: { material: "100% handspun khadi cotton", color: "Natural ecru", dimensions: "200 x 70 cm", origin: "Ponduru, Andhra Pradesh", care: "Machine wash cold, gentle" },
  },
  {
    sku: "KH-STL-003",
    title: "Tussar Silk Stole with Madhubani Painting",
    description:
      "Wild tussar silk, hand-painted with a Madhubani peacock motif by artisans in Bihar. Every piece is one of a kind.",
    agentSummary: "Tussar silk stole, hand-painted Madhubani peacock, gold/maroon, 190x55 cm, one-of-a-kind, $74.",
    price: "74.00",
    stock: 6,
    tags: ["stole", "tussar", "silk", "madhubani", "hand-painted", "art"],
    attributes: { material: "Tussar silk", color: "Natural gold & maroon", dimensions: "190 x 55 cm", origin: "Madhubani, Bihar", care: "Dry clean only" },
  },
  {
    sku: "KH-SAR-001",
    title: "Kanchipuram Silk Saree: Temple Border, Emerald",
    description:
      "Pure mulberry silk with a contrasting zari temple border and rich pallu. Includes an unstitched blouse piece.",
    agentSummary: "Kanchipuram pure silk saree, emerald with gold zari temple border, 6.3 m incl. blouse piece, $160.",
    price: "160.00",
    stock: 3,
    tags: ["saree", "kanchipuram", "silk", "wedding", "green", "zari"],
    attributes: { material: "Pure mulberry silk, silver-gold zari", color: "Emerald green", dimensions: "6.3 m incl. 0.8 m blouse", origin: "Kanchipuram, Tamil Nadu", care: "Dry clean only" },
  },
  {
    sku: "KH-SAR-002",
    title: "Chanderi Cotton-Silk Saree: Mint Buttis",
    description:
      "Light, glossy Chanderi with delicate woven buttis. Office-friendly and easy to drape.",
    agentSummary: "Chanderi cotton-silk saree, mint green with gold buttis, 6.2 m incl. blouse, lightweight, $88.",
    price: "88.00",
    stock: 9,
    tags: ["saree", "chanderi", "cotton silk", "mint", "office wear", "lightweight"],
    attributes: { material: "Cotton-silk blend", color: "Mint green", dimensions: "6.2 m incl. 0.8 m blouse", origin: "Chanderi, Madhya Pradesh", care: "Dry clean recommended" },
  },
  {
    sku: "KH-SAR-003",
    title: "Sambalpuri Ikat Cotton Saree: Indigo",
    description:
      "Tie-and-dye ikat cotton from western Odisha in deep indigo with traditional conch and wheel motifs.",
    agentSummary: "Sambalpuri ikat cotton saree, indigo with white motifs, 6.3 m incl. blouse, everyday wear, $72.",
    price: "72.00",
    stock: 0,
    tags: ["saree", "sambalpuri", "ikat", "cotton", "indigo", "blue"],
    attributes: { material: "100% cotton", color: "Indigo blue", dimensions: "6.3 m incl. 0.8 m blouse", origin: "Sambalpur, Odisha", care: "Hand wash separately, cold" },
  },
  {
    sku: "KH-TBR-001",
    title: "Hand Block-Printed Table Runner: Indigo Dabu",
    description:
      "Mud-resist dabu printing from Bagru on heavy cotton. Works for everyday tables and dinner parties alike.",
    agentSummary: "Cotton table runner, indigo dabu hand block print, 180x35 cm (fits 6-seater), $28.",
    price: "28.00",
    stock: 30,
    tags: ["table runner", "block print", "dabu", "indigo", "cotton", "home decor"],
    attributes: { material: "100% cotton canvas", color: "Indigo & white", dimensions: "180 x 35 cm", origin: "Bagru, Rajasthan", care: "Machine wash cold, line dry" },
  },
  {
    sku: "KH-TBR-002",
    title: "Handwoven Jute & Cotton Table Runner: Mustard Stripe",
    description:
      "Rustic jute and cotton with a mustard stripe, handwoven in West Bengal. Textured, sturdy and low maintenance.",
    agentSummary: "Jute-cotton handwoven table runner, natural with mustard stripes, 150x33 cm, $22.",
    price: "22.00",
    stock: 18,
    tags: ["table runner", "jute", "cotton", "mustard", "rustic", "home decor"],
    attributes: { material: "60% jute, 40% cotton", color: "Natural & mustard", dimensions: "150 x 33 cm", origin: "Nadia, West Bengal", care: "Spot clean or gentle hand wash" },
  },
  {
    sku: "KH-CUS-001",
    title: "Kantha Embroidered Cushion Cover: Sunset (Set of 2)",
    description:
      "Upcycled vintage cotton saris layered and hand-stitched with running-stitch kantha. Colors vary slightly.",
    agentSummary: "Set of 2 kantha cushion covers, recycled cotton, sunset orange/pink, 16x16 in (40 cm), insert not included, $34.",
    price: "34.00",
    stock: 15,
    tags: ["cushion cover", "kantha", "embroidered", "orange", "upcycled", "set of 2"],
    attributes: { material: "Recycled cotton saree layers", color: "Sunset orange & pink", dimensions: "16 x 16 in (40 x 40 cm)", origin: "Bolpur, West Bengal", care: "Hand wash cold" },
  },
  {
    sku: "KH-CUS-002",
    title: "Ajrakh Block-Printed Cushion Cover: Madder Red",
    description:
      "Ajrakh is a 16-step resist print using natural madder and indigo dyes. Zip closure.",
    agentSummary: "Ajrakh hand block-printed cotton cushion cover, madder red/indigo, natural dyes, 18x18 in, $18.",
    price: "18.00",
    stock: 50,
    tags: ["cushion cover", "ajrakh", "block print", "red", "natural dye", "cotton"],
    attributes: { material: "100% cotton cambric", color: "Madder red & indigo", dimensions: "18 x 18 in (45 x 45 cm)", origin: "Ajrakhpur, Gujarat", care: "Machine wash cold, wash separately" },
  },
  {
    sku: "KH-CUS-003",
    title: "Banarasi Silk Brocade Cushion Cover: Royal Blue",
    description:
      "Rich silk brocade offcuts from Varanasi looms with gold zari florals. Hidden zip, piped edges.",
    agentSummary: "Banarasi silk brocade cushion cover, royal blue with gold zari, 16x16 in, luxury, $42.",
    price: "42.00",
    stock: 1,
    tags: ["cushion cover", "banarasi", "brocade", "silk", "blue", "luxury"],
    attributes: { material: "Silk brocade, zari", color: "Royal blue & gold", dimensions: "16 x 16 in (40 x 40 cm)", origin: "Varanasi, Uttar Pradesh", care: "Dry clean only" },
  },
];

const missedSearches: { query: string; channel: "WEB_AGENT" | "MCP"; client?: string }[] = [
  { query: "indigo silk scarf", channel: "MCP", client: "claude-desktop" },
  { query: "men's kurta", channel: "WEB_AGENT" },
  { query: "block print bedsheet king", channel: "MCP", client: "cursor" },
  { query: "mens kurta size L", channel: "MCP", client: "claude-desktop" },
  { query: "king size block printed bed cover", channel: "WEB_AGENT" },
  { query: "silk scarf indigo blue", channel: "WEB_AGENT" },
  { query: "linen kurta for men", channel: "MCP", client: "chatgpt" },
  { query: "handwoven rug 5x7", channel: "WEB_AGENT" },
  { query: "dhurrie rug", channel: "MCP", client: "claude-desktop" },
  { query: "block print quilt queen", channel: "WEB_AGENT" },
  { query: "silk tie", channel: "MCP", client: "chatgpt" },
  { query: "napkins set of 6 block print", channel: "WEB_AGENT" },
  { query: "kids lehenga", channel: "MCP", client: "cursor" },
  { query: "organic cotton bath towel", channel: "WEB_AGENT" },
  { query: "indigo bedsheet king size", channel: "MCP", client: "claude-desktop" },
];

async function main() {
  const storeData = {
    name: "Kaveri Handlooms",
    tagline: "Handwoven in India, shipped to your door in the US.",
    description:
      "Kaveri Handlooms works directly with weaving clusters across India, from Kanchipuram silk to Bagru block prints, and ships heirloom-quality textiles to US buyers. Every piece is handmade, so small variations are part of the charm.",
    currency: "USD",
    returnPolicy:
      "Returns accepted within 30 days of delivery for unused items in original packaging. Sarees with blouse pieces cut or stitched are final sale. Refunds go to the original PayPal payment within 5 business days of receiving the return.",
    shippingPolicy:
      "Ships from Bengaluru via DHL Express to all 50 US states. Free shipping on orders over $75, otherwise a flat $9.99. Delivery in 5–8 business days. US import duties are included.",
    maxOrderValue: "500.00",
  };

  const store = await prisma.store.upsert({
    where: { slug: SLUG },
    update: storeData,
    create: { slug: SLUG, ...storeData },
  });

  await prisma.$transaction([
    prisma.agentEvent.deleteMany({ where: { storeId: store.id } }),
    prisma.order.deleteMany({ where: { storeId: store.id } }),
    prisma.product.deleteMany({ where: { storeId: store.id } }),
    prisma.product.createMany({
      data: products.map((p) => ({ ...p, storeId: store.id, imageUrl: img(p.sku) })),
    }),
  ]);

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  await prisma.agentEvent.createMany({
    data: missedSearches.map((s, i) => ({
      storeId: store.id,
      type: "SEARCH" as const,
      channel: s.channel,
      query: s.query,
      resultCount: 0,
      payload: { query: s.query, agentClient: s.client ?? "web-chat", seeded: true },
      createdAt: new Date(now - sevenDays + Math.floor((sevenDays / missedSearches.length) * i)),
    })),
  });

  console.log(`Seeded ${store.name} (${SLUG}): ${products.length} products, ${missedSearches.length} missed searches.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
