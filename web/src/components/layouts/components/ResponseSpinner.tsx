import React from "react";

interface ResponseSpinnerProps {
  text: string;
  className?: string;
  themeStyles: string;
}

export const ResponseSpinner: React.FC<ResponseSpinnerProps> = ({
  text,
  className = "",
  themeStyles,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${themeStyles} ${className}`}
    >
      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {text}
    </span>
  );
};

export default ResponseSpinner;
