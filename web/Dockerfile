FROM node:24-alpine AS base

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
ARG XYZEN_VERSION
ENV NODE_ENV=production
ENV VITE_XYZEN_BACKEND_URL=${VITE_XYZEN_BACKEND_URL}
ENV XYZEN_VERSION=${XYZEN_VERSION}

# Build the application
# The build script in package.json is "rimraf site && tsc -b && vite build"
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Stage 2: Serve with nginx (lightweight, dotfiles supported, SPA routing)
FROM nginx:alpine AS runner

COPY --from=builder /app/site /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 32233

LABEL org.opencontainers.image.source=https://github.com/scienceol/xyzen
LABEL org.opencontainers.image.description="AI Research Interface"
