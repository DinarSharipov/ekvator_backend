# Используем Node 24
FROM node:24-alpine

# Устанавливаем необходимые зависимости для Prisma
RUN apk add --no-cache openssl libc6-compat bash

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package.json package-lock.json ./
RUN npm install

# Копируем весь код, Prisma и сгенерированные файлы
COPY . .

RUN npm run build

EXPOSE 3000

# Запускаем приложение
CMD ["npm", "run", "start:dev"]
