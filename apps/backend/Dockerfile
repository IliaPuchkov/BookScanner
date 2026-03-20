FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ocr-processor/package.json ./packages/ocr-processor/
COPY tsconfig.json ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
COPY packages/ocr-processor ./packages/ocr-processor

# Build
RUN pnpm --filter @bookscanner/shared build && \
    pnpm --filter @bookscanner/ocr-processor build && \
    pnpm --filter @bookscanner/backend build

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/main"]
