# Backend JS Migration

Этот каталог — переписывание backend с Rust на JavaScript (Node.js + Express + SQLite).

## Что уже перенесено

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `PATCH /api/me`
- `POST /api/me/password`
- `GET /api/profile/:nickname`
- `GET /api/health`

## Что еще в переносе

- Все `blog` маршруты
- Все `courses` маршруты (Classroom, assignments, lectures)
- `invites`, `admin`, `privacy`, `notifications`, uploads

## Запуск

```bash
cd backend-js
npm install
npm run dev
```

По умолчанию используется база `./edu.db`.
