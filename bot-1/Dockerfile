# Build Stage
FROM node:lts-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci && \
    apk add --no-cache ffmpeg

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production Stage
FROM node:lts-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    apk add --no-cache ffmpeg

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db/schema.ts ./src/db/

# Expose the data volume
VOLUME ["/app/data"]

# Start the application
CMD ["npm", "start"]
