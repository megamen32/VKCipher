# Referee Protocol

## Граница доверия

Referee владеет `sdk.js`, `referee.js`, corpus и тестами. Агентам запрещено менять эти файлы во время оцениваемого раунда.

Криптография фиксирована: AES-256-GCM, 96-bit IV и 128-bit authentication tag. Creator кодирует только непрозрачный `Buffer` и не может удалять tag, повторно использовать часть plaintext или передавать данные вне текста сообщения.

## Ход раунда

1. Referee формирует обычные сообщения и секретные plaintext.
2. Referee шифрует plaintext и передаёт creator только ciphertext bytes и публичный context.
3. Результат creator проходит VK transport simulation и validation.
4. Referee вызывает creator `decode`, затем самостоятельно проверяет GCM tag и точное совпадение plaintext.
5. Critic обучается на отдельной размеченной выборке.
6. На blind-выборке critic видит только строки сообщений и возвращает score `0..1`.
7. Referee считает ROC-AUC, ошибки порога, overhead и итоговые очки.

## Защита от подгонки

- Training и evaluation используют разные round IDs, IV и варианты сообщений.
- Финальный corpus и seed могут быть заменены без изменения API.
- Creator не должен читать `critic/submission.js`; critic не должен читать `creator/submission.js`.
- Ни один агент не должен читать ключ, plaintext blind-выборки или label до вызова score.
- Сетевые запросы, файловый side channel и долговременная таблица «round ID → payload» запрещены.
- Ошибка round-trip или нарушение транспорта напрямую обнуляют соответствующую часть creator score.

## API submissions

Creator:

```js
module.exports = {
    name: 'scheme-name',
    encode({ payload, context, random }) { return 'message'; },
    decode({ message, context }) { return Buffer.from([]); },
};
```

Critic:

```js
module.exports = {
    name: 'detector-name',
    train([{ message, label }]) { return model; },
    score({ message, model }) { return 0.5; },
};
```

`context` не является секретным каналом: в нём только стабильные production-параметры вроде locale и лимита сообщения. Уникальный `roundId` creator не получает.
