"use client";

import { useState } from "react";
import { swatchUrl } from "@/lib/swatch";
import { cn } from "@/lib/utils";

/** Product image with a generated textile-swatch fallback when the URL is missing or fails. */
export function ProductImage({
  src,
  alt,
  sku,
  className,
}: {
  src: string | null;
  alt: string;
  sku: string;
  className?: string;
}) {
  const fallback = swatchUrl(sku, { title: alt });
  const [current, setCurrent] = useState(src || fallback);

  return (
    <div className={cn("overflow-hidden bg-muted", className)}>
      {/* Merchant images can come from any host, so a plain <img> is intentional. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        loading="lazy"
        className="size-full object-cover"
        onError={() => current !== fallback && setCurrent(fallback)}
      />
    </div>
  );
}
