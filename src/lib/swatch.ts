/**
 * Deterministic textile-swatch artwork (SVG) used as product imagery when a merchant has no
 * photos. Served from our own origin so demos never depend on a third-party image host.
 */

const COLOR_WORDS: Record<string, string> = {
  saffron: "#E8912D", teal: "#1F7A7A", pink: "#E7A4B4", blush: "#E9B8C2", crimson: "#B3152B",
  red: "#B3232F", maroon: "#6E1A2B", gold: "#C9A227", mustard: "#D4A017", charcoal: "#3F4249",
  grey: "#8A8D93", gray: "#8A8D93", ecru: "#E9DFC9", natural: "#E2D6BC", emerald: "#1E7B4F",
  green: "#2F7D4F", mint: "#9ED9BF", indigo: "#2E3A87", blue: "#2F5DA8", royal: "#2445A3",
  white: "#F4F1EA", orange: "#E2702F", sunset: "#E66B3A", rainbow: "#D9534F", madder: "#9E2A2B",
  black: "#26262A", purple: "#6B3FA0", yellow: "#E9C53A", brown: "#7A5233", beige: "#D9C7A7",
};

const PALETTES = [
  ["#2E3A87", "#E9DFC9", "#B3232F"],
  ["#1F7A7A", "#E8912D", "#F4F1EA"],
  ["#6E1A2B", "#C9A227", "#F4F1EA"],
  ["#1E7B4F", "#E9C53A", "#F4F1EA"],
  ["#9E2A2B", "#2E3A87", "#E9DFC9"],
];

export type SwatchKind = "stripe" | "ikat" | "border" | "dots";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function kindFor(text: string): SwatchKind {
  const t = text.toLowerCase();
  if (/saree|sari|dupatta|lehenga/.test(t)) return "border";
  if (/cushion|pillow|ikat|throw|blanket/.test(t)) return "ikat";
  if (/runner|block|print|ajrakh|dabu|bag|tote|napkin/.test(t)) return "dots";
  return "stripe";
}

export function colorsFor(seed: string, colorText = ""): [string, string, string] {
  const found = colorText
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((w) => COLOR_WORDS[w])
    .filter(Boolean);
  const base = PALETTES[hash(seed) % PALETTES.length];
  const [a, b, c] = [found[0] ?? base[0], found[1] ?? base[1], found[2] ?? base[2]];
  return [a, b === a ? base[1] : b, c === a || c === b ? base[2] : c];
}

/** Relative URL for a product's swatch. */
export function swatchUrl(sku: string, opts: { title?: string; color?: string | null } = {}): string {
  const params = new URLSearchParams({ k: kindFor(`${opts.title ?? ""} ${sku}`) });
  if (opts.color) params.set("c", opts.color.slice(0, 60));
  return `/api/swatch/${encodeURIComponent(sku)}?${params}`;
}

export function renderSwatchSvg(seed: string, kind: SwatchKind, colorText = ""): string {
  const [a, b, c] = colorsFor(seed, colorText);
  const h = hash(seed);
  const s = 400;
  let body = "";

  if (kind === "stripe") {
    const w = 18 + (h % 14);
    let x = 0;
    let i = 0;
    while (x < s) {
      const col = [a, b, a, c][i % 4];
      const width = i % 4 === 3 ? w / 3 : w;
      body += `<rect x="${x}" y="0" width="${width}" height="${s}" fill="${col}"/>`;
      x += width;
      i++;
    }
    body += `<rect width="${s}" height="${s}" fill="url(#weave)"/>`;
  } else if (kind === "ikat") {
    body += `<rect width="${s}" height="${s}" fill="${b}"/>`;
    const step = 80;
    for (let y = -step / 2; y < s + step; y += step / 2) {
      for (let x = (y / (step / 2)) % 2 === 0 ? 0 : step / 2; x < s + step; x += step) {
        body += `<path d="M${x} ${y - 30} L${x + 26} ${y} L${x} ${y + 30} L${x - 26} ${y} Z" fill="${a}" opacity="0.92"/>`;
        body += `<path d="M${x} ${y - 12} L${x + 10} ${y} L${x} ${y + 12} L${x - 10} ${y} Z" fill="${c}"/>`;
      }
    }
  } else if (kind === "border") {
    body += `<rect width="${s}" height="${s}" fill="${a}"/>`;
    for (let x = 30; x < s; x += 60) {
      for (let y = 30; y < 280; y += 60) body += `<circle cx="${x + ((y / 60) % 2) * 30}" cy="${y}" r="5" fill="${c}"/>`;
    }
    body += `<rect y="290" width="${s}" height="110" fill="${b}"/>`;
    for (let x = 0; x < s; x += 40) body += `<path d="M${x} 290 L${x + 20} 315 L${x + 40} 290 Z" fill="${c}"/>`;
    body += `<rect y="345" width="${s}" height="8" fill="${c}"/><rect y="365" width="${s}" height="3" fill="${c}"/>`;
  } else {
    body += `<rect width="${s}" height="${s}" fill="${b}"/>`;
    for (let y = 25; y < s; y += 50) {
      for (let x = 25; x < s; x += 50) {
        body += `<circle cx="${x}" cy="${y}" r="14" fill="${a}"/><circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
<defs><pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3h6" stroke="#000" stroke-opacity="0.08"/><path d="M3 0v6" stroke="#fff" stroke-opacity="0.06"/></pattern></defs>
${body}<rect width="${s}" height="${s}" fill="url(#weave)"/></svg>`;
}
