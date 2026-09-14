# Dockerfile — Электронный учебник (Book)
# Сборка: docker build -t literature-book .
# Запуск: docker run -p 4173:4173 --env-file .env literature-book

FROM node:20-alpine AS base

# Системные библиотеки для puppeteer (используется в scripts/export_pdf.mjs)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

WORKDIR /app

# puppeteer использует системный Chromium, а не скачивает свой
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .

EXPOSE 4173

# Создаём директорию для данных (JSON-БД)
RUN mkdir -p data

ENV NODE_ENV=production

CMD ["node", "server.js"]
