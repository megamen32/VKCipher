# LLM и обновление тестов

## Ограничения

Arena не отключает safety-фильтры модели и не пытается обходить блокировки.
Для LLM smoke-тестов используйте нейтральные placeholder-ы (`[TOPIC_A]`,
`[ACTION_B]`, `[OBJECT_C]`) вместо чувствительных терминов или описаний.
API-ключ не записывается в репозиторий, логи и fixtures.

## Переменные окружения

Используйте OpenAI-compatible endpoint только через переменные окружения:

```bash
export LLM_BASE_URL="https://llm.bezrabotnyi.com/v1"
export LLM_MODEL="gemma4"
export LLM_API_KEY="..."
```

Не добавляйте эти значения в `.js`, `.json`, `.env`, Playwright trace или
commit. Если endpoint недоступен или отвечает ошибкой, smoke-тест должен
завершаться понятной ошибкой, а обычные локальные тесты должны продолжать
работать без LLM.

## Как обновлять corpus

1. Добавьте короткие нейтральные сообщения в `arena/corpus/messages.js`.
2. Для обычных сообщений используйте `normalMessages`, для защищённых
   plaintext-сообщений -- `secretMessages`.
3. Не добавляйте в corpus реальные секреты, токены, персональные данные или
   инструкции для причинения вреда.
4. Если сообщение содержит emoji, проверяйте и code points, и UTF-16 units:
   пара surrogate units считается как две единицы лимита VK.
5. После изменения corpus запускайте весь набор проверок:

```bash
npm run build
node --check extension/vkencrypt.user.js
npm test -- --reporter=line
npm run arena -- --rounds=256
npm run test:arena
git diff --check
```

## Как добавлять regression-тест

- Криптографию и кодеки добавляйте в `tests/playwright/crypto.spec.js`.
- DOM, composer, авторасшифровку и ошибки добавляйте в
  `tests/playwright/userscript.spec.js`.
- Media и cross-origin поведение добавляйте в
  `tests/playwright/media.spec.js`.
- Ограничения VK и adversarial cases добавляйте в
  `tests/playwright/adversarial-arena.spec.js`.
- Для каждого найденного бага сначала добавьте минимальный падающий тест,
  затем исправление, затем повторите полный набор команд выше.
- Не используйте реальный VK в обычном CI-тесте: live-проверка запускается
  отдельно через `RUN_LIVE=1 npm run test:live`.
