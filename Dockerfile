FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json ./

# Устанавливаем все зависимости (включая devDependencies, чтобы был доступен Nest CLI)
RUN npm install

COPY tsconfig.json ./
COPY src ./src

# Собираем проект (используется локальный nest из node_modules/.bin)
RUN npm run build

# После сборки переключаем окружение в production
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
