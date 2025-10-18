FROM registry.sciol.ac.cn/library/node:24-alpine AS base

FROM base AS deps
WORKDIR /app

# Copy package manager files
COPY package.json yarn.lock* .yarnrc.yml* ./
COPY vite.config.mts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./

# Install dependencies
RUN corepack enable

RUN yarn install --frozen-lockfile

# Stage 1: Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# Enable corepack to use the correct yarn version
RUN corepack enable

COPY . .

# Set build-time environment variables
ARG VITE_XYZEN_BACKEND_URL
ENV NODE_ENV=production
# 🔥 修复：ENV 名称要和 ARG 保持一致
ENV VITE_XYZEN_BACKEND_URL=${VITE_XYZEN_BACKEND_URL}

# Build the application
# The build script in package.json is "rimraf site && tsc -b && vite build"
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Stage 2: Serve the application using a lightweight Node.js server
FROM base AS runner
WORKDIR /app

# Copy only the built application assets from the build stage
COPY --from=builder /app/site ./

# Expose the port the app will run on
EXPOSE 32233

# Start a production-ready server for SPAs using 'serve'
# npx will download and run 'serve' without needing it in package.json
# The '-s' flag handles SPA routing by redirecting all requests to index.html
CMD ["npx", "-y", "serve", "-s", ".", "-l", "32233"]
