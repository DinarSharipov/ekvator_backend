FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# 1. зависимости
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. код + prisma + dist
COPY dist ./dist
COPY prisma ./prisma

# 3. prisma client (НЕ требует DATABASE_URL)
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/main.js"]
