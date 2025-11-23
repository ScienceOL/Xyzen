import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig, type BuildOptions, type PluginOption } from "vite";
import dts from "vite-plugin-dts";

// https://vite.dev/config/
export default defineConfig(() => {
  const isLibBuild = process.env.BUILD_MODE === "library";

  const plugins: PluginOption[] = [react(), tailwindcss()];

  if (isLibBuild) {
    plugins.push(
      dts({
        insertTypesEntry: true,
        tsconfigPath: "./tsconfig.app.json",
      }),
    );
  }

  const build: BuildOptions = {
    outDir: isLibBuild ? "dist" : "site",
  };

  if (isLibBuild) {
    build.lib = {
      entry: path.resolve(import.meta.dirname, "src/index.ts"),
      name: "Xyzen",
      fileName: (format: string) => `xyzen.${format}.js`,
    };
    build.rollupOptions = {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
        banner: '"use client";',
      },
    };
  }

  const config = {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    optimizeDeps: {
      include: ["shiki", "upng-js"],
    },
    ssr: {
      noExternal: ["shiki"],
    },
    server: {
      host: true, // 监听所有地址
      port: 32234,
      strictPort: true,
      watch: {
        usePolling: true, // Docker 环境下必须启用轮询
        interval: 100, // 轮询间隔（毫秒）
      },
      hmr: {
        // 热模块替换配置
        host: "localhost",
        port: 32233,
      },
      proxy: {
        // 代理 Bohrium API 请求以解决 CORS 问题
        "/api/bohrium": {
          target: "https://www.bohrium.com",
          changeOrigin: true,
          rewrite: (path: string) =>
            path.replace(/^\/api\/bohrium/, "/bohrapi"),
          secure: true,
          headers: {
            Origin: "https://www.bohrium.com",
          },
        },
        "/api/openapi": {
          target: "https://openapi.dp.tech",
          changeOrigin: true,
          rewrite: (path: string) =>
            path.replace(/^\/api\/openapi/, "/openapi"),
          secure: true,
          headers: {
            Origin: "https://openapi.dp.tech",
          },
        },
      },
    },
    build,
  };

  // For app mode, the default build config is used, which builds from index.html

  return config;
});
