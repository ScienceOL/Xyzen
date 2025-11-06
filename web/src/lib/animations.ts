import type { Variants } from "framer-motion";

/**
 * Common animation variants for Framer Motion
 * @module animations
 */

// ============================================================================
// Basic Fade Animations
// ============================================================================

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const fadeOut: Variants = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};

// ============================================================================
// Item Animations (for individual items in lists)
// ============================================================================

export const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

export const itemSlideLeft: Variants = {
  hidden: { x: -20, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

export const itemSlideRight: Variants = {
  hidden: { x: 20, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

// ============================================================================
// Container Animations (for lists with staggered children)
// ============================================================================

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const containerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

export const containerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

// ============================================================================
// Scale Animations
// ============================================================================

export const scaleIn: Variants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20,
    },
  },
};

export const scaleOut: Variants = {
  visible: { scale: 1, opacity: 1 },
  hidden: {
    scale: 0.8,
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// ============================================================================
// Card/Modal Animations
// ============================================================================

export const cardHover = {
  scale: 1.02,
  transition: { duration: 0.2 },
};

export const cardTap = {
  scale: 0.98,
  transition: { duration: 0.1 },
};

export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

export const modalContent: Variants = {
  hidden: { scale: 0.95, opacity: 0, y: 20 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    y: 20,
    transition: { duration: 0.2 },
  },
};

// ============================================================================
// Slide Animations (for panels, drawers, etc.)
// ============================================================================

export const slideInFromTop: Variants = {
  hidden: { y: -100, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

export const slideInFromBottom: Variants = {
  hidden: { y: 100, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

export const slideInFromLeft: Variants = {
  hidden: { x: -100, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

export const slideInFromRight: Variants = {
  hidden: { x: 100, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
    },
  },
};

// ============================================================================
// Page Transition Animations
// ============================================================================

export const pageTransition: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a custom stagger container with specific timing
 */
export const createStaggerContainer = (
  staggerChildren: number = 0.08,
  delayChildren: number = 0.1,
): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren,
      delayChildren,
    },
  },
});

/**
 * Create a custom item variant with specific offset
 */
export const createItemVariant = (
  offset: { x?: number; y?: number } = { y: 20 },
  springConfig: { stiffness?: number; damping?: number } = {},
): Variants => ({
  hidden: { ...offset, opacity: 0 },
  visible: {
    x: 0,
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: springConfig.stiffness || 100,
      damping: springConfig.damping || 12,
    },
  },
});
