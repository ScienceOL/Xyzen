"use client";

import * as React from "react";
import { motion, type Transition } from "motion/react";
import { EmblaOptionsType, EmblaCarouselType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-react";
import { Button } from "@/components/animate-ui/components/buttons/button";
import { ChevronRight, ChevronLeft } from "lucide-react";

type MotionCarouselProps = {
  children: React.ReactNode;
  options?: EmblaOptionsType;
  showDots?: boolean;
  showArrows?: boolean;
};

type EmblaControls = {
  selectedIndex: number;
  scrollSnaps: number[];
  prevDisabled: boolean;
  nextDisabled: boolean;
  onDotClick: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

type DotButtonProps = {
  selected?: boolean;
  label: string;
  onClick: () => void;
};

const transition: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 24,
  mass: 1,
};

const useEmblaControls = (
  emblaApi: EmblaCarouselType | undefined,
): EmblaControls => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);
  const [prevDisabled, setPrevDisabled] = React.useState(true);
  const [nextDisabled, setNextDisabled] = React.useState(true);

  const onDotClick = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const onPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const onNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateSelectionState = (api: EmblaCarouselType) => {
    setSelectedIndex(api.selectedScrollSnap());
    setPrevDisabled(!api.canScrollPrev());
    setNextDisabled(!api.canScrollNext());
  };

  const onInit = React.useCallback((api: EmblaCarouselType) => {
    setScrollSnaps(api.scrollSnapList());
    updateSelectionState(api);
  }, []);

  const onSelect = React.useCallback((api: EmblaCarouselType) => {
    updateSelectionState(api);
  }, []);

  React.useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi);
    emblaApi.on("reInit", onInit).on("select", onSelect);

    return () => {
      emblaApi.off("reInit", onInit).off("select", onSelect);
    };
  }, [emblaApi, onInit, onSelect]);

  return {
    selectedIndex,
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  };
};

function MotionCarousel({
  children,
  options,
  showDots = true,
  showArrows = true,
}: MotionCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const {
    selectedIndex,
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  } = useEmblaControls(emblaApi);

  const slides = React.Children.toArray(children);

  return (
    <div className="w-full space-y-4 [--slide-spacing:1rem] [--slide-size:80%] sm:[--slide-size:45%] lg:[--slide-size:33.33%]">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y touch-pinch-zoom">
          {slides.map((child, index) => {
            const isActive = index === selectedIndex;

            return (
              <motion.div
                key={index}
                className="mr-[var(--slide-spacing)] basis-[var(--slide-size)] flex-none flex min-w-0"
              >
                <motion.div
                  className="size-full"
                  initial={false}
                  animate={{
                    scale: isActive ? 1 : 0.95,
                  }}
                  transition={transition}
                >
                  {child}
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {(showArrows || showDots) && (
        <div className="flex justify-between">
          {showArrows ? (
            <Button size="icon" onClick={onPrev} disabled={prevDisabled}>
              <ChevronLeft className="size-5" />
            </Button>
          ) : (
            <div />
          )}

          {showDots && (
            <div className="flex flex-wrap justify-end items-center gap-2">
              {scrollSnaps.map((_, index) => (
                <DotButton
                  key={index}
                  label={`Slide ${index + 1}`}
                  selected={index === selectedIndex}
                  onClick={() => onDotClick(index)}
                />
              ))}
            </div>
          )}

          {showArrows ? (
            <Button size="icon" onClick={onNext} disabled={nextDisabled}>
              <ChevronRight className="size-5" />
            </Button>
          ) : (
            <div />
          )}
        </div>
      )}
    </div>
  );
}

function DotButton({ selected = false, label, onClick }: DotButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={false}
      className="flex cursor-pointer select-none items-center justify-center rounded-full border-none bg-primary text-primary-foreground text-sm"
      animate={{
        width: selected ? 68 : 12,
        height: selected ? 28 : 12,
      }}
      transition={transition}
    >
      <motion.span
        layout
        initial={false}
        className="block whitespace-nowrap px-3 py-1"
        animate={{
          opacity: selected ? 1 : 0,
          scale: selected ? 1 : 0,
          filter: selected ? "blur(0)" : "blur(4px)",
        }}
        transition={transition}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}

export { MotionCarousel };
export type { MotionCarouselProps };
