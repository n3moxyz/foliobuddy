# Stage 1: Build
FROM node:20-alpine AS builder

# npm 10 crashes while resolving this standalone dependency graph.
RUN apk add --no-cache openssl && npm install --global npm@11.19.1

WORKDIR /app

# Force dev deps to install even if NODE_ENV=production is set by CI
ENV NODE_ENV=development

# Copy package files and install all deps (including devDependencies for build)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Keep the installer consistent with the builder stage.
RUN apk add --no-cache openssl && npm install --global npm@11.19.1

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production deps only
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev

# Generate Prisma client in production image
RUN npx prisma generate

# Copy built output from builder
COPY --from=builder /app/dist ./dist/

EXPOSE 3001

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
