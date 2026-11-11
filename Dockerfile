# Используем Node 24
FROM node:24-alpine AS base
WORKDIR /app
FROM base AS build

# Копируем package.json и устанавливаем зависимости
COPY package.json package-lock.json ./
RUN npm ci

# Копируем весь код, Prisma и сгенерированные файлы
COPY . .

RUN DATABASE_URL=postgresql://localhost:5432/codegen_only npx prisma generate && npm run build
FROM base AS runtime

# Устанавливаем необходимые зависимости для Prisma
RUN apk add --no-cache openssl libc6-compat bash

COPY --from=build /app/dist .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api-json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Запускаем приложение
CMD ["sh", "-c", "npx prisma migrate deploy && exec node main.js"]
