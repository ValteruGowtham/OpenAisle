import { Placeholder } from "@/components/placeholder";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Placeholder title={`Merchant dashboard · ${slug}`} note="Live agent feed, orders, Missed Demand and Copilot coming soon." />;
}
