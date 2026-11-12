export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return new Response(`# ${slug}\n\nAgent discovery text coming soon.\n`, {
    status: 501,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
