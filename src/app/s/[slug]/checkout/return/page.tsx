import { Placeholder } from "@/components/placeholder";

export default async function CheckoutReturnPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Placeholder title={`Checkout · ${slug}`} note="Payment capture and receipt coming soon." />;
}
