FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

RUN npm install

COPY . .

RUN npm run build:shared
RUN npm run build:db
RUN npm run build:api

FROM node:20-alpine AS release
WORKDIR /app

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/packages/db/dist ./packages/db/dist
COPY --from=base /app/packages/db/package.json ./packages/db/package.json
COPY --from=base /app/packages/db/prisma ./packages/db/prisma

CMD ["npm", "run", "start:api"]

