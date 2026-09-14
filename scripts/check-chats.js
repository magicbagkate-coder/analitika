// Диагностический скрипт: смотрит реальные чаты из Sitniks и печатает,
// какие значения встречаются в поле status, плюс один чат целиком —
// чтобы свериться с реальными именами полей.
// Запуск (в папке проекта): node --env-file=.env scripts/check-chats.js

const baseUrl = process.env.SITNIKS_API_URL;
const apiKey = process.env.SITNIKS_API_KEY;

async function main() {
  const response = await fetch(`${baseUrl}/open-api/chats?limit=20`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  const text = await response.text();
  if (!response.ok) {
    console.log(`HTTP ${response.status}`);
    console.log(text);
    return;
  }

  const data = JSON.parse(text);
  console.log('Верхний уровень ответа, ключи:', Object.keys(data));

  const items = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
  console.log(`Чатов получено: ${items.length}`);

  const statuses = new Set(items.map((chat) => chat.status));
  console.log('Встреченные значения status:', [...statuses]);

  if (items[0]) {
    console.log('Пример одного чата целиком:');
    console.log(JSON.stringify(items[0], null, 2));
  }
}

main().catch((error) => console.log('Ошибка запроса:', error.message));
