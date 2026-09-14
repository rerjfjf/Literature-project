#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
PORT="${PORT:-4173}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js и запустите скрипт снова."
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Папка проекта не найдена: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "Внимание: файл .env не найден. ИИ-проверка не будет работать без API-ключа."
fi

echo "Запускаю электронный учебник..."
echo "Адрес: http://localhost:$PORT"
echo "Для остановки нажмите Ctrl+C"

PORT="$PORT" npm start
