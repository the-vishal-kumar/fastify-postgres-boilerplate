# syntax=docker/dockerfile:1.7

# ---- build: install all deps and compile TypeScript ----
FROM node:22.23.5-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- deps: production dependencies only ----
FROM node:22.23.5-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts && npm cache clean --force

# ---- runtime: no compiler, no dev deps, no package managers, non-root ----
FROM node:22.23.5-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
# The service never runs npm, so drop it and its bundled dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./
COPY --chown=node:node contract ./contract
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node src/docs ./src/docs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# node runs as PID 1 and handles SIGTERM/SIGINT itself (src/index.ts).
CMD ["node", "build/src/index.js"]
