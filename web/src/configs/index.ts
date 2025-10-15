const isDevelopment = import.meta.env.MODE === "development";
const isProduction = import.meta.env.MODE === "production";

console.log("=== Environment Debug ===");
console.log("MODE:", import.meta.env.MODE);
console.log("isDevelopment:", isDevelopment);
console.log("isProduction:", isProduction);
console.log("VITE_XYZEN_BACKEND_URL:", import.meta.env.VITE_XYZEN_BACKEND_URL);

// 智能后端URL配置：
// - 如果设置了VITE_XYZEN_BACKEND_URL环境变量，使用它
// - 开发环境默认使用localhost:48196
// - 生产环境使用相对路径，自动匹配当前域名
const getBackendURL = (): string => {
  if (import.meta.env.VITE_XYZEN_BACKEND_URL) {
    return import.meta.env.VITE_XYZEN_BACKEND_URL;
  }

  if (isProduction && window !== undefined) {
    return `${window.location.protocol}//${window.location.host}`;
  }

  return "http://localhost:48196";
};

export const DEFAULT_BACKEND_URL = getBackendURL();

console.log("Final DEFAULT_BACKEND_URL:", DEFAULT_BACKEND_URL);
