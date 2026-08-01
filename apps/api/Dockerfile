# =============================================================================
# API da Rede Colheita — imagem para Render / Railway / Fly.
# Build a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t rede-colheita-api .
# =============================================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---------------------------------------------------------------- dependências
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces --include-workspace-root || npm install

# ---------------------------------------------------------------------- build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY . .
RUN npm run build --workspace @a-ponte/contracts
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace @a-ponte/api

# --------------------------------------------------------------------- runtime
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3333

# `migrate deploy` na subida mantém o schema em dia sem passo manual de deploy.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
