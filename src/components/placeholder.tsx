import Link from "next/link";

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← OpenAisle
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{note}</p>
    </main>
  );
}
