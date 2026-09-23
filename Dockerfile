# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies only, from the lockfile, as a cached layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src

# Never run as root.
USER node

EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8082/health || exit 1

# Run node directly (not via npm) so SIGTERM reaches the process for graceful shutdown.
CMD ["node", "src/server.js"]
