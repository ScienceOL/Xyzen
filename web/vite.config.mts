import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig, type BuildOptions, type PluginOption } from "vite";
import dts from "vite-plugin-dts";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(() => {
  const isLibBuild = process.env.BUILD_MODE === "library";
  const isIframeBuild = process.env.BUILD_MODE === "iframe";

  const plugins: PluginOption[] = [react(), tailwindcss()];

  // PWA 仅用于站点构建；库构建会生成很大的 UMD 包，不应进入 Workbox precache
  if (!isLibBuild) {
    // 在 Bohrium App 内嵌模式下禁用 PWA 功能，并且自毁 Service Worker
    if (isIframeBuild) {
      plugins.push(
        VitePWA({
          selfDestroying: true,
          registerType: "autoUpdate",
          devOptions: { enabled: false },
        }),
      );
    } else {
      plugins.push(
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: ["icon.png", "icon-512.png"],
          manifest: {
            name: "Xyzen",
            short_name: "Xyzen",
            description: "Xyzen Application",
            display: "standalone",
            display_override: ["window-controls-overlay"],
            // background_color: "#000000",
            // theme_color: "#000000",
            icons: [
              // {
              //   src: "icon.png",
              //   sizes: "256x256",
              //   type: "image/png",
              // },
              {
                src: "icon-512.png",
                sizes: "512x512",
                type: "image/png",
                // purpose: "maskable",
              },
            ],
          },
          devOptions: {
            enabled: true,
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
            // 排除 /api 和 /xyzen 开头的请求，避免 Service Worker 拦截后端接口
            navigateFallbackDenylist: [/^\/api/, /^\/xyzen/],
          },
        }),
      );
    }
  }

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
      include: [
        "shiki",
        "upng-js",
        "platejs",
        "platejs/react",
        "platejs/static",
        "@platejs/markdown",
        "@platejs/media/react",
      ],
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
