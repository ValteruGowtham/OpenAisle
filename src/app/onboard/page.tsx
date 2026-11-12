import type { Metadata } from "next";
import Link from "next/link";
import { OnboardClient } from "./onboard-client";

export const metadata: Metadata = { title: "Import your catalog · OpenAisle" };

export default function OnboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← OpenAisle
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Make your shop agent-ready</h1>
        <p className="max-w-2xl text-muted-foreground">
          Paste your catalog in any format: a WhatsApp list, notes or a spreadsheet. We&apos;ll turn it
          into clean product data that AI shopping agents can understand, and score how ready it is.
        </p>
      </div>
      <OnboardClient />
    </main>
  );
}
