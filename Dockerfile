# Используем Node 24
FROM node:24-alpine AS base
WORKDIR /app
FROM base AS build

# Копируем package.json и устанавливаем зависимости
COPY package.json package-lock.json ./
RUN npm ci

# Копируем весь код, Prisma и сгенерированные файлы
COPY . .

RUN npm run build
FROM base AS runtime

# Устанавливаем необходимые зависимости для Prisma
RUN apk add --no-cache openssl libc6-compat bash

COPY --from=build /app/dist /app
EXPOSE 3000
# Запускаем приложение
CMD npx prisma generate && node main.js
