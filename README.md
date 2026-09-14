# Sitniks Scoring

NestJS-сервис для оценки чатов менеджер-клиент из Sitniks CRM через Claude.

## Статус

Пока это только интеграционный слой — по модулю на каждый узел Sitniks API,
плюс `evaluation`, который умеет прогнать один чат через Claude и записать
оценку обратно. Опрос Sitniks (кто ещё не оценён) и запуск по расписанию —
следующий шаг, ещё не подключён.

Docker и база данных сейчас не используются — проект рассчитан на локальный
запуск через `npm`. Telegram-модуль в коде есть, но не подключён к приложению.

## Запуск

1. `npm install`
2. Скопируй `.env.example` в `.env`, впиши реальные `SITNIKS_API_KEY` и `ANTHROPIC_API_KEY`.
3. `npm run start:dev`

## Структура (по одному узлу интеграции на модуль)

- `src/sitniks-client` — общий HTTP-клиент к Sitniks (базовый URL + Bearer-токен), остальные модули только его используют
- `src/sitniks-chat` — `GET /open-api/chats/{chatId}` — один чат
- `src/sitniks-chat-list` — `GET /open-api/chats` — список чатов
- `src/sitniks-chat-messages` — `GET /open-api/chats/{chatId}/messages` — сообщения чата
- `src/sitniks-chat-notes` — `POST /open-api/chats/{chatId}/notes` — заметка на чат
- `src/sitniks-chat-update` — `PUT /open-api/chats/{chatId}` — тег / переназначение менеджера
- `src/sitniks-managers` — `GET /open-api/managers` — список менеджеров
- `src/claude` — вызов Claude для оценки диалога
- `src/evaluation` — Claude-оценка → тег + заметка обратно в Sitniks
- `src/telegram` — отправка сообщений в Telegram (пока не подключено)

## TODO

- Sitniks не даёт вебхуков — только опрос (polling) через `GET /open-api/chats`. Нужно решить: какое значение `status` у закрытого чата в твоём аккаунте, и как часто опрашивать — это следующая точечная задача.
- Часть полей в `*.types.ts` помечена TODO — документация Sitniks обрывалась на середине схемы, часть имён полей (сообщения, менеджер) не подтверждена, поправим по факту первого реального ответа API.
- Тестов пока нет — договорились сделать позже.
