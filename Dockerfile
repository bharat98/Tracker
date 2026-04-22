# Multi-stage build for Cloud Run / any container host.
# Stage 1: build the React client to static files.
FROM node:20-alpine AS client-build
WORKDIR /build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

# Stage 2: production server image.
# Uses node:20-alpine + build tools needed for better-sqlite3's native binding.
FROM node:20-alpine
WORKDIR /app

# better-sqlite3 needs python/make/g++ at install-time only
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && mkdir -p /app/data

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev && apk del .build-deps

COPY server ./server
COPY --from=client-build /build/client/dist ./server/public

# Cloud Run injects PORT=8080; local defaults to 3000 if unset.
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/tracker.db

# Persistent volume mount point for the SQLite file.
VOLUME ["/app/data"]

EXPOSE 8080
CMD ["node", "server/src/index.js"]
