// ==UserScript==
// @name         VK P2P AES-GCM
// @namespace    local
// @version      5.4.0
// @description  P2P шифрование VK: seed-фраза, AES-GCM, словарный транспорт и сборка длинных сообщений
// @author       VKEncrypt
// @match        https://vk.com/*
// @match        https://m.vk.com/*
// @match        https://vk.ru/*
// @match        https://m.vk.ru/*
// @match        https://web.vk.me/*
// @match        https://m.web.vk.me/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      vk.com
// @connect      m.vk.com
// @connect      vk.ru
// @connect      m.vk.ru
// @connect      *.vk.com
// @connect      *.vk.ru
// @connect      userapi.com
// @connect      *.userapi.com
// @connect      mycdn.me
// @connect      *.mycdn.me
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js
// @downloadURL  https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // VK P2P AES-GCM v5.4.0
    //
    // Что умеет:
    // - НЕ показывает модалку сразу после установки.
    // - Пока ключей нет, кнопки возле поля ввода открывают настройку.
    // - В seed-модалках есть "глаз" для просмотра вводимой фразы.
    // - Из seed-фразы детерминированно генерирует k1..k4.
    // - Сохраняет НЕ seed-фразу, а только производные ключи.
    // - Поддерживает пользовательские ключи 64 hex.
    // - Поддерживает временный ключ только в памяти.
    // - Умеет автошифровать при клике отправки и при Enter.
    // - Shift+Enter оставляет как перенос строки.
    // - При включённом автошифровании ручной замок скрывается.
    // - Опционально кодирует payload в emoji, кириллицу или русский словарь.
    // ============================================================

    const APP_NAME = 'VK P2P AES-GCM';
    const APP_VERSION = '5.4.0';

    const FORMAT_START = '𓁗';
    const FORMAT_MID = 'Ⰴ';
    const FORMAT_PAYLOAD = 'Ⱑ';
    const CODEC_MARKERS = {
        base64: '𐌁',
        emoji: '𐌄',
        cyrillic: '𐌓',
        words: 'слова'
    };

    const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    // 64 emoji для замены Base64-символов.
    // Важно: режим emoji опциональный, Base64 надёжнее для копирования/пересылки.
    const EMOJI_ALPHABET = [
        '😀','😁','😂','🤣','😃','😄','😅','😆',
        '😉','😊','😋','😎','😍','😘','🥰','😗',
        '😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
        '😑','😶','🙄','😏','😣','😥','😮','🤐',
        '😯','😪','😫','🥱','😴','😌','😛','😜',
        '😝','🤤','😒','😓','😔','😕','🙃','🤑',
        '😲','😡','🤬','😖','😞','😟','😤','😢',
        '😭','😦','😧','😨','😩','🤯','😬','😰'
    ];

    const EMOJI_PAD = '🟰';
    const CYRILLIC_ALPHABET = [
        'А','Б','В','Г','Д','Е','Ж','З',
        'И','Й','К','Л','М','Н','О','П',
        'Р','С','Т','У','Ф','Х','Ц','Ч',
        'Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
        'а','б','в','г','д','е','ж','з',
        'и','й','к','л','м','н','о','п',
        'р','с','т','у','ф','х','ц','ч',
        'ш','щ','ъ','ы','ь','э','ю','я'
    ];

    const CIPHER_CODECS = {
        base64: { shortCode: CODEC_MARKERS.base64, label: 'Base64' },
        emoji: { shortCode: CODEC_MARKERS.emoji, label: 'Emoji' },
        cyrillic: { shortCode: CODEC_MARKERS.cyrillic, label: 'Русский алфавит' },
        words: { shortCode: CODEC_MARKERS.words, label: 'Русские слова (экспериментально)' }
    };

    const README_URL = 'https://github.com/megamen32/vkencrypt#readme';
    const INSTALL_URL = 'https://raw.githubusercontent.com/megamen32/vkencrypt/master/extension/vkencrypt.user.js';
    const CYBERCHEF_URL = 'https://gchq.github.io/CyberChef/';
    const ONE_TIME_NOTE_SERVICES = [
        'PrivateBin: https://privatebin.net/',
        'Onetime Secret: https://onetimesecret.com/',
        'Password Pusher: https://pwpush.com/'
    ];
    const MEDIA_CONTAINER_MAGIC = 'VKEM1';
    const MEDIA_CONTAINER_EXT = '.vke';
    const MEDIA_ENCRYPTED_MIME = 'application/octet-stream';

    const IV_LEN = 12;
    const TAG_LEN = 16;
    const WORDS_DICTIONARY_ID = 'ru-common-8192-v4';
    const WORDS_BITS = 13;
    const MAX_VK_UTF16_UNITS = 4000;
    const WORDS_GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const WORDS_GROUP_STORAGE_KEY = 'vk_p2p_word_groups_v1';

    const DEFAULT_KEY_SLOT = 'k1';

    const STORAGE_KEYS = {
        DERIVED_KEYS: 'vk_p2p_derived_keys_v1',
        CUSTOM_KEYS: 'vk_p2p_custom_keys_v1',
        SETTINGS: 'vk_p2p_settings_v1',
        CHAT_KEY_SLOTS: 'vk_p2p_chat_key_slots_v1'
    };

    const KDF_SALT = 'vk-p2p-aes-gcm-v1';
    const KDF_ITERATIONS = 250000;

    let DERIVED_KEYS = null;
    let CUSTOM_KEYS = {};
    let TEMP_KEY = null;
    let CHAT_KEY_SLOTS = {};

    let currentKeySlot = DEFAULT_KEY_SLOT;
    let currentChatContextId = '';

    let settings = {
        autoEncrypt: false,
        saveDerivedKeys: true,
        autoDecrypt: true,
        cipherCodec: 'emoji',
        encryptMediaUploads: true
    };

    let isAutoSending = false;
    let skipNextAutoEncrypt = false;
    let lastEncryptedAt = 0;
    let pendingWordMessages = [];
    let scanTimer = null;
    let mediaPreviewObserver = null;
    const MEDIA_DECRYPT_CACHE = new Map();
    const STORAGE_FALLBACK_PREFIX = 'vk-p2p-fallback:';
    const RUNTIME_PLATFORM = detectRuntimePlatform();
