import { motion } from "framer-motion";
import type React from "react";

interface AnimatedTextProps {
  children: React.ReactNode;
  isAnimating?: boolean;
  animated?: boolean;
}

/**
 * AnimatedText 组件
 * 用于为文本内容提供淡入效果
 * 参照 lobe-chat 的 UI 集成模式
 */
export const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  isAnimating = false,
  animated = true,
}) => {
  if (!animated || !isAnimating) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0.7 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeIn" }}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedText;
