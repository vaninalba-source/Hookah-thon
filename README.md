# Todo List

Простой список задач: регистрация, вход, выход, создание, редактирование, выполнение и удаление своих задач. Интерфейс на русском.

## Требования

Git и работающий Docker Desktop с Docker Compose: https://www.docker.com/products/docker-desktop/.
Node.js и PostgreSQL на компьютере для Docker-запуска не нужны. Для разработки без Docker — Node.js 24 LTS (`.nvmrc`) и PostgreSQL 17.

## Первый запуск

В терминале:

```bash
git clone https://github.com/vaninalba-source/Hookah-thon.git
cd Hookah-thon
cp .env.example .env
```

Откройте `.env` и заполните `POSTGRES_PASSWORD` длинным случайным паролем из букв и цифр. Не публикуйте этот файл.

```bash
docker compose up --build -d
```

Откройте http://localhost:5173. Зарегистрируйтесь: email и пароль от 8 до 128 символов.
PostgreSQL проверяется через healthcheck, миграции Prisma применяются автоматически перед запуском backend.

## Остановка

```bash
docker compose down
```

Задачи сохраняются в Docker volume. Повторный запуск — той же командой `docker compose up --build -d`. Команда `docker compose down -v` удалит базу.

## Проверка сборки без Docker

```bash
cd backend
npm ci
npm run db:generate
npm run build
cd ../frontend
npm ci
npm run build
```

Backend: TypeScript, встроенный HTTP-модуль Node.js, Prisma и PostgreSQL. Frontend: React, Vite, Tailwind CSS; Nginx раздаёт сборку и проксирует `/api`.
Таблица `Session` нужна для серверного выхода: в базе хранится только SHA-256 хеш случайного токена; cookie — HttpOnly, SameSite=Strict, на HTTPS также Secure. Пароли хешируются scrypt с индивидуальной солью. Каждое обращение к задаче ограничено `userId` на backend.
Приложение рассчитано на локальный запуск; при размещении в интернете нужен HTTPS и соответствующий `APP_ORIGIN` в `.env`.
