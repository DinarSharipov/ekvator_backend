FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY prisma ./prisma
COPY node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
