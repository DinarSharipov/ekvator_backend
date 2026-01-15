FROM node:24-alpine

RUN apk add --no-cache openssl libc6-compat bash

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && node dist/main.js"
