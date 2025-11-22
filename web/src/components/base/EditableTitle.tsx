"use client";

import { PencilIcon } from "@heroicons/react/20/solid";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface EditableTitleProps {
  title: string;
  onSave: (newTitle: string) => Promise<void>;
  className?: string;
  textClassName?: string;
  maxLength?: number;
}

export default function EditableTitle({
  title,
  onSave,
  className = "",
  textClassName = "",
  maxLength = 100,
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步外部title变化
  useEffect(() => {
    setEditValue(title);
  }, [title]);

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发父元素的点击事件
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (isSaving) return;

    const trimmedValue = editValue.trim();

    // 如果输入为空或与原标题相同，则不保存
    if (!trimmedValue || trimmedValue === title) {
      setEditValue(title);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedValue);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save title:", error);
      // 保存失败时恢复原标题
      setEditValue(title);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    // 延迟执行保存，让其他事件（如点击）有机会执行
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 100);
  };

  if (isEditing) {
    return (
      <div
        className={className}
        onClick={(e) => e.stopPropagation()} // 阻止编辑状态下的点击事件冒泡
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()} // 阻止输入框点击事件冒泡
          maxLength={maxLength}
          disabled={isSaving}
          className={`
            bg-transparent border-b border-indigo-300 dark:border-indigo-600
            focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400
            transition-colors ${textClassName}
            ${isSaving ? "opacity-50 cursor-not-allowed" : ""}
          `}
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.span
        key={title}
        initial={{ opacity: 0, filter: "blur(8px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={textClassName}
        onClick={(e) => e.stopPropagation()} // 阻止点击标题文本时触发父元素的点击事件
      >
        {title}
      </motion.span>
      <button
        onClick={handleEditClick}
        className={`
          ml-2 p-1 rounded transition-opacity
          ${isHovered ? "opacity-100" : "opacity-0"}
          hover:bg-neutral-100 dark:hover:bg-neutral-800
          text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300
        `}
        title="编辑标题"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
