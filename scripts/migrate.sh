#!/bin/sh

set -e

echo "Waiting for database to be ready..."
sleep 5

echo "Generating Prisma Client..."
npx prisma generate

echo "Checking if migrations exist..."
if [ ! -d "prisma/migrations" ] || [ -z "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "No migrations found. Syncing database schema..."
  # Используем db push для автоматической синхронизации схемы с БД
  # Это создаст таблицы на основе schema.prisma без файлов миграций
  npx prisma db push --accept-data-loss --skip-generate
else
  echo "Migrations found. Applying existing migrations..."
  npx prisma migrate deploy
fi

echo "Database schema is up to date!"
