# VKEncrypt

Шифрует сообщения в ВКонтакте. Установка — 5 секунд.

<img src="docs/media/IMG_9299_part1.webp" width="280" alt="VKEncrypt (iPhone) в действии">&nbsp;&nbsp;<img src="docs/media/IMG_9299_part2.webp" width="280" alt="VKEncrypt (Android) расшифровка">

## Установка

### Компьютер — Tampermonkey

1. Установите расширение [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) в свой браузер (Chrome / Firefox / Edge / Brave).
2. Нажмите **[Установить VKEncrypt](https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js)** — Tampermonkey сам откроет окно установки. Жмите «Установить».
3. Откройте `vk.com`, `vk.ru` или `web.vk.me` и зайдите в любой чат.

### Chrome — тестовая MV3-сборка

Для ручной установки расширения соберите ZIP:

```bash
npm run build:chrome
```

Архив появится в `dist/chrome/`. В Chrome откройте `chrome://extensions`, включите «Режим разработчика», выберите «Загрузить распакованное расширение» и укажите `dist/chrome/package`. ZIP предназначен для релизов и ручного тестирования; установка для обычных пользователей требует публикации в Chrome Web Store.

Chrome-сборка пока использует тот же userscript как content script. Текстовые сообщения и UI используют существующую реализацию; cross-origin расшифровка медиа через `GM_xmlhttpRequest` ещё требует отдельного extension service-worker bridge.

### Firefox — тестовая MV3-сборка

```bash
npm run build:firefox
```

Архив появится в `dist/firefox/`. Для локального теста распакуйте `dist/firefox/package` через `about:debugging → This Firefox → Load Temporary Add-on`; постоянная публичная установка требует подписи Mozilla.

### Safari — Web Extension pipeline

```bash
npm run build:safari
```

На macOS с Xcode команда дополнительно запускает `xcrun safari-web-extension-converter` и создаёт проект в `dist/safari/xcode/`. На Linux/CI без Apple tooling создаётся converter-ready source в `dist/safari/source/`.

### iPhone — Safari

1. Установите бесплатное приложение [Userscripts](https://apps.apple.com/app/userscripts/id1463296397) из App Store.
2. Откройте **Настройки iOS → Safari → Расширения → Userscripts** и включите расширение. 
3. Откройте в safari: **[Установить VKEncrypt](https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js)**. Нажмите слева от адрессной строки на меню, в меню нажмите "Userscripts", в Userscripts наверху нажмите "Tap to install".  <img src="docs/media/install_ios.gif" width="280" alt="Установка расширения">
4. Откройте `vk.com`, `vk.ru` или `web.vk.me` в Safari и зайдите в любой чат.

### Android — Firefox Browser

Firefox — мобильный браузер, который поддерживает полноценные расширения.

1. Установите **[Firefox Browser](https://play.google.com/store/apps/details?id=org.mozilla.firefox&hl=ru)** из Google Play.
2. Внутри Firefox установите **[Tampermonkey](https://addons.mozilla.org/ru/firefox/addon/tampermonkey/)**.
3. Нажмите **[Установить VKEncrypt](https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js)** — Tampermonkey предложит установку.
4. Откройте `vk.com`, `vk.ru` или `web.vk.me` и зайдите в любой чат.

## Как пользоваться

При первом открытии чата в поле ввода появятся две иконки:

- **🔒** — зашифровать набранное сообщение. Если ключей ещё нет — откроется окно настройки.
- **🔑** — меню ключей, настроек и seed-фразы.

Выбранный через меню 🔑 ключ запоминается отдельно для каждого диалога. При переходе в другой чат VKEncrypt автоматически восстанавливает его ключ; `vk.com`, `vk.ru` и `web.vk.me` используют общий идентификатор собеседника.

Введи секретную фразу (≥ 6 символов, лучше длиннее) — скрипт детерминированно сгенерирует ключи `k1..k4` и сохранит их. Собеседник с той же фразой получит те же ключи. Можно также добавлять свои 64-hex ключи через меню.

Опционально: **автошифрование** (в меню 🔑) — тогда Enter сам шифрует и отправляет, а ручной 🔒 прячется. Shift+Enter остаётся переносом строки.

**Голосовые и вложения:** настройка «Шифровать вложения и голосовые» включена по умолчанию. Первый клик по микрофону начинает защищённую запись, второй останавливает её и прикрепляет AES-GCM файл `.vke`. У собеседника с тем же ключом он автоматически откроется как аудиоплеер. Запись отправляется как защищённый документ, а не как штатная voice-карточка VK: сервер VK принимает в неё только незашифрованное аудио.

**Русские слова (экспериментально):** шифротекст можно передавать markerless-пакетами из фиксированного словаря `ru-common-8192-v4` (SHA-256: `d6ce1bca2d8715a390842773d65a88b643e9f95bec6e9e4eda7b81c0aa88a2a4`). В нём используются безопасные слова из проверенной выборки; исходный denylist исключён. Длинные сообщения автоматически разбиваются на части до 4000 UTF-16 единиц VK и собираются обратно после получения всех частей. Это транспортный формат, а не гарантия естественной или незаметной речи.

## Подробности

- Как устроено шифрование, как менять ключи, формат шифра, безопасность — в [TECHNICAL.md](TECHNICAL.md).
- Экспериментальная creator-vs-critic арена для оценки новых форматов шифротекста — в [arena/README.md](arena/README.md).
- Установка VK-бота (опционально, если хотите перенести своего тг бота в вк) — в [bot/README.md](bot/README.md).
- Детали по расширению для разработчиков — в [extension/README.md](extension/README.md).

## Лицензия

[MIT](LICENSE)
