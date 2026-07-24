# VKEncrypt middleware для VK-ботов

Общее Node.js-ядро можно подключить к любому боту на `vk-io`: оно расшифровывает входящие сообщения до обработки ботом и шифрует ответы после обработки.

## Быстрое подключение к `vk-io`

```js
import { createVkEncryptMiddleware } from './vkencrypt-middleware.mjs';

const middleware = createVkEncryptMiddleware({
    seed: process.env.VK_ENCRYPT_SEED,
});

// Вызвать до регистрации собственных message_new handlers.
middleware.wrapVkIo(vk);
```

После первого зашифрованного входящего сообщения middleware запоминает для пары `account + peer` ключ и codec. Ответы этого диалога шифруются тем же ключом и codec; обычные сообщения остаются обычными.

Поддерживаются формат userscript v5.4 и codec `emoji`, `base64`, `cyrillic`. Алгоритм: AES-256-GCM, PBKDF2-SHA256 250 000 итераций при использовании seed-фразы.

## OpenClaw VK

Установщик изменяет только runtime-файл `@openclaw-vk/vk`, а не OpenClaw core и не другие каналы.

1. Создай seed-файл с правами только для владельца:

```bash
printf '%s\n' 'та же секретная фраза, что в VKEncrypt' > ~/.openclaw/vkencrypt-vk.seed
chmod 600 ~/.openclaw/vkencrypt-vk.seed
```

2. Установи адаптер в найденный VK-плагин:

```bash
node bot/node/openclaw-vk-encrypt.mjs install
```

Если плагин установлен в нестандартное место:

```bash
node bot/node/openclaw-vk-encrypt.mjs install --plugin-dir=~/.openclaw/extensions/vk
```

3. Перезапусти gateway:

```bash
openclaw gateway restart
```

### Настройка по каналам и аккаунтам

Для нескольких каналов или VK-аккаунтов создай `~/.openclaw/vkencrypt.json`:

```json
{
  "channels": {
    "vk": {
      "accounts": {
        "default": {
          "seedFile": "~/.openclaw/vkencrypt-vk.seed"
        },
        "work": {
          "seedFile": "~/.openclaw/vkencrypt-vk-work.seed"
        }
      }
    }
  }
}
```

`accountId` выбирается самим VK-каналом OpenClaw. Если для аккаунта отдельная запись не задана, используется `default`. Другие OpenClaw-каналы не включаются автоматически. Для одного аккаунта достаточно `seedFile` прямо в `channels.vk`.

Переменные `VK_ENCRYPT_SEED`, `VK_ENCRYPT_KEY`, `VK_ENCRYPT_KEY_FILE` и `VK_ENCRYPT_CONFIG_FILE` остаются запасным вариантом для запуска без JSON-конфигурации. Токен VK middleware не читает и не меняет.

## Обновление плагина

После обновления `@openclaw-vk/vk` повтори команду `install`. Установщик создаёт резервную копию исходного `dist/src/inbound.js` рядом с файлом с суффиксом `.vkencrypt-original` и не ставит патч повторно.

Сейчас адаптер защищает текстовые payload. Вложения, голосовые, изображения и видео этим Node-адаптером пока не шифруются.
