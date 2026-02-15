"use client";

import * as React from "react";
import { EmblaOptionsType, EmblaCarouselType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type MotionCarouselProps = {
  children: React.ReactNode;
  options?: EmblaOptionsType;
  showDots?: boolean;
  showArrows?: boolean;
  className?: string;
};

const useEmblaControls = (emblaApi: EmblaCarouselType | undefined) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const scrollTo = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );
  const scrollPrev = React.useCallback(
    () => emblaApi?.scrollPrev(),
    [emblaApi],
  );
  const scrollNext = React.useCallback(
    () => emblaApi?.scrollNext(),
    [emblaApi],
  );

  React.useEffect(() => {
    if (!emblaApi) return;

    const sync = () => {
      setScrollSnaps(emblaApi.scrollSnapList());
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };

    sync();
    emblaApi.on("reInit", sync).on("select", sync);
    return () => {
      emblaApi.off("reInit", sync).off("select", sync);
    };
  }, [emblaApi]);

  return {
    selectedIndex,
    scrollSnaps,
    canScrollPrev,
    canScrollNext,
    scrollTo,
    scrollPrev,
    scrollNext,
  };
};

function MotionCarousel({
  children,
  options,
  showDots = true,
  showArrows = true,
  className,
}: MotionCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(options, [
    WheelGesturesPlugin(),
  ]);
  const {
    selectedIndex,
    scrollSnaps,
    canScrollPrev,
    canScrollNext,
    scrollTo,
    scrollPrev,
    scrollNext,
  } = useEmblaControls(emblaApi);

  const slides = React.Children.toArray(children);

  return (
    <div className={cn("group/carousel relative w-full", className)}>
      {/* Viewport */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="-ml-3 flex touch-pan-y touch-pinch-zoom">
          {slides.map((child, index) => (
            <div
              key={index}
              className="min-w-0 flex-none basis-[80%] pl-3 sm:basis-[45%] lg:basis-[33.33%]"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Arrows — overlaid on edges, only visible on hover */}
      {showArrows && (
        <>
          <button
            onClick={scrollPrev}
            disabled={!canScrollPrev}
            className={cn(
              "absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm transition-all dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-300",
              "hover:bg-white hover:shadow-md dark:hover:bg-neutral-700",
              "disabled:pointer-events-none disabled:opacity-0",
              "opacity-0 group-hover/carousel:opacity-100",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={scrollNext}
            disabled={!canScrollNext}
            className={cn(
              "absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm transition-all dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-300",
              "hover:bg-white hover:shadow-md dark:hover:bg-neutral-700",
              "disabled:pointer-events-none disabled:opacity-0",
              "opacity-0 group-hover/carousel:opacity-100",
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Dots — small, inline, below slides */}
      {showDots && scrollSnaps.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              onClick={() => scrollTo(index)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                index === selectedIndex
                  ? "w-5 bg-neutral-800 dark:bg-neutral-200"
                  : "w-1.5 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-600 dark:hover:bg-neutral-500",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { MotionCarousel };
export type { MotionCarouselProps };
