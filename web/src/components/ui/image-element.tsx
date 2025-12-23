"use client";

import { cn } from "@/lib/utils";
import { PlateElement, useElement } from "platejs/react";
import type { TElement } from "platejs";

// Image element extends TElement with url property
interface ImageElementType extends TElement {
  url: string;
}

/**
 * ImageElement Component
 *
 * Renders an image element in the Plate editor.
 * Uses PlateElement wrapper to properly handle Slate props.
 */
export function ImageElement({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof PlateElement>) {
  const element = useElement<ImageElementType>();

  return (
    <PlateElement className={cn("relative my-4", className)} {...props}>
      <div contentEditable={false}>
        <div className="relative inline-block max-w-full overflow-hidden rounded-lg">
          <img
            src={element.url}
            className="max-h-[400px] max-w-full object-contain"
            alt=""
          />
        </div>
      </div>
      {children}
    </PlateElement>
  );
}

export default ImageElement;
