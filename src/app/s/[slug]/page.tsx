import { Placeholder } from "@/components/placeholder";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Placeholder title={`Storefront · ${slug}`} note="Storefront and Shop-with-AI chat coming soon." />;
}
