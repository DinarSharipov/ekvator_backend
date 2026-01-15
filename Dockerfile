# Stage 1: Build
FROM node:24-alpine AS builder
RUN apk add --no-cache openssl libc6-compat bash

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:24-alpine
RUN apk add --no-cache openssl libc6-compat bash

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
