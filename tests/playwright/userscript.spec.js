// Тесты userscript'а в моке VK-чата. Без сети, без Tampermonkey —
// userscript грузится через page.evaluate с стабами GM_*.
const { test, expect } = require('@playwright/test');
const {
    openMockChat,
    openModernWebVkChat,
} = require('./helpers');
const {
    BASE64_ALPHABET,
    EMOJI_ALPHABET,
    EMOJI_PAD,
    CYRILLIC_ALPHABET,
    FORMAT_START,
    FORMAT_MID,
    FORMAT_PAYLOAD,
    MEDIA_CONTAINER_MAGIC,
    CODEC_MARKERS,
    deriveDerivedKeys,
    encryptForEmoji,
    makeBaseSettings,
    setComposerText,
    getComposerText,
    renderEmojiAsImages,
    buildEncryptedMediaContainer,
    encryptWordPackets,
} = require('./test-support');

test('init: скрипт грузится, рисует кнопки в старом поле ввода', async ({ page }) => {
    await openMockChat(page);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await expect(page.locator('#vk-p2p-enc-btn')).toBeVisible();
    await expect(page.locator('#vk-p2p-key-btn')).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
});

test('init: скрипт рисует кнопки в web.vk.me composer без старых классов', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await openModernWebVkChat(page);

    await expect(page.locator('#vk-p2p-enc-btn')).toBeVisible();
    await expect(page.locator('#vk-p2p-key-btn')).toBeVisible();

    const controlsParent = await page.locator('#vk-p2p-enc-controls').evaluate(el => el.parentElement?.className || '');
    expect(controlsParent).toContain('vk-modern-composer');

    expect(errors, errors.join('\n')).toEqual([]);
});

test('composer controls: настройки после загрузки файла, замок перед emoji', async ({ page }) => {
    await openMockChat(page, {
        url: 'https://example.com',
        body: `
            <div class="ConvoComposer__inputPanel">
                <div class="DropdownReforged ConvoComposer__clip DropdownReforged--closed">
                    <div class="DropdownReforged__trigger">
                        <button class="ConvoComposer__button" aria-label="Загрузить файл">+</button>
                    </div>
                </div>
                <div role="presentation" class="ComposerInput ConvoComposer__inputWrapper">
                    <div role="presentation">
                        <span contenteditable="true"
                              class="ComposerInput__input ConvoComposer__input ComposerInput__input--fixed"
                              data-placeholder="Сообщение"
                              inputmode="text"
                              translate="no"
                              role="textbox"
                              aria-multiline="true"
                              aria-label="Сообщение">1</span>
                    </div>
                </div>
                <button class="ConvoComposer__button" aria-label="Выбрать эмодзи">☺</button>
                <div class="DropdownReforged DropdownReforged--closed">
                    <div class="DropdownReforged__trigger">
                        <button class="ConvoComposer__button ConvoComposer__sendButton--submit" aria-label="Отправить сообщение">→</button>
                    </div>
                </div>
            </div>
        `,
    });

    const wrapperParent = await page.locator('#vk-p2p-enc-controls').evaluate(el => el.parentElement?.className || '');
    expect(wrapperParent).toContain('ConvoComposer__inputPanel');

    const order = await page.locator('.ConvoComposer__inputPanel').evaluate(panel => {
        const children = Array.from(panel.children).map(el => ({
            id: el.id || '',
            className: el.className || '',
            hasUploadButton: el.matches?.('[aria-label*="Загрузить файл"]') || !!el.querySelector?.('[aria-label*="Загрузить файл"]'),
            hasInput: !!el.querySelector?.('[contenteditable="true"]'),
            hasEmojiButton: el.matches?.('[aria-label*="эмодзи"]') || !!el.querySelector?.('[aria-label*="эмодзи"]'),
            hasSendButton: el.matches?.('[aria-label*="Отправить"]') || !!el.querySelector?.('[aria-label*="Отправить"]'),
        }));
        return children;
    });

    const keyIndex = order.findIndex(item => item.id === 'vk-p2p-key-controls');
    const controlsIndex = order.findIndex(item => item.id === 'vk-p2p-enc-controls');
    const uploadIndex = order.findIndex(item => item.hasUploadButton);
    const inputIndex = order.findIndex(item => item.hasInput);
    const emojiIndex = order.findIndex(item => item.hasEmojiButton);
    const sendIndex = order.findIndex(item => item.hasSendButton);

    expect(keyIndex).toBeGreaterThan(uploadIndex);
    expect(keyIndex).toBeLessThan(inputIndex);
    expect(controlsIndex).toBeGreaterThanOrEqual(0);
    expect(controlsIndex).toBeGreaterThan(inputIndex);
    expect(controlsIndex).toBeLessThan(emojiIndex);
    expect(sendIndex).toBeGreaterThan(emojiIndex);

    await expect(page.locator('.DropdownReforged__trigger #vk-p2p-key-controls')).toHaveCount(0);
    await expect(page.locator('.DropdownReforged__trigger #vk-p2p-enc-controls')).toHaveCount(0);
});

test('composer controls: при autoEncrypt скрывается весь wrapper замка без пустого места', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для скрытия замка');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoEncrypt: true })),
        },
        body: `
            <div class="ConvoComposer__inputPanel">
                <div class="DropdownReforged ConvoComposer__clip DropdownReforged--closed">
                    <div class="DropdownReforged__trigger">
                        <button class="ConvoComposer__button" aria-label="Загрузить файл">+</button>
                    </div>
                </div>
                <div role="presentation" class="ComposerInput ConvoComposer__inputWrapper">
                    <div role="presentation">
                        <span contenteditable="true"
                              class="ComposerInput__input ConvoComposer__input ComposerInput__input--fixed"
                              role="textbox"
                              aria-multiline="true"
                              aria-label="Сообщение">1</span>
                    </div>
                </div>
                <button class="ConvoComposer__button" aria-label="Выбрать эмодзи">☺</button>
                <div class="DropdownReforged DropdownReforged--closed">
                    <div class="DropdownReforged__trigger">
                        <button class="ConvoComposer__button ConvoComposer__sendButton--submit" aria-label="Отправить сообщение">→</button>
                    </div>
                </div>
            </div>
        `,
    });

    await expect(page.locator('#vk-p2p-enc-controls')).toBeHidden();

    const order = await page.locator('.ConvoComposer__inputPanel').evaluate(panel => {
        return Array.from(panel.children)
            .filter(el => getComputedStyle(el).display !== 'none')
            .map(el => ({
                id: el.id || '',
                hasInput: !!el.querySelector?.('[contenteditable="true"]'),
                hasEmojiButton: el.matches?.('[aria-label*="эмодзи"]') || !!el.querySelector?.('[aria-label*="эмодзи"]'),
            }));
    });

    const keyIndex = order.findIndex(item => item.id === 'vk-p2p-key-controls');
    const inputIndex = order.findIndex(item => item.hasInput);
    const emojiIndex = order.findIndex(item => item.hasEmojiButton);
    const encIndex = order.findIndex(item => item.id === 'vk-p2p-enc-controls');

    expect(encIndex).toBe(-1);
    expect(keyIndex).toBeGreaterThanOrEqual(0);
    expect(keyIndex).toBeLessThan(inputIndex);
    expect(keyIndex).toBeLessThan(emojiIndex);
});

test('share instruction: пункт меню вставляет plaintext-инструкцию без шифрования', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для инструкции');
    let sentText = '';

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoEncrypt: true })),
        },
        body: `
            <div class="ConvoComposer__inputPanel">
                <button class="ConvoComposer__button" aria-label="Загрузить файл">+</button>
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button" aria-label="Выбрать эмодзи">☺</button>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await page.locator('[aria-label="Отправить"]').evaluate(button => {
        button.addEventListener('click', () => {
            window.__sentText = document.querySelector('[contenteditable="true"]').innerText.trim();
        });
    });

    await page.locator('#vk-p2p-key-btn').click();
    await page.getByRole('button', { name: /Скинуть инструкцию/i }).click();
    await expect(page.locator('#vk-p2p-share-install-url')).toBeChecked();
    await expect(page.locator('#vk-p2p-share-cyberchef')).toBeChecked();
    await page.locator('#vk-p2p-share-send').click();

    sentText = await page.evaluate(() => window.__sentText || '');

    expect(sentText).toContain('VKEncrypt');
    expect(sentText).toContain('https://github.com/megamen32/VKCipher#readme');
    expect(sentText).toContain('CyberChef');
    expect(sentText).toContain('Ключ я отправлю отдельно');
    expect(sentText).not.toMatch(/^𓁗/u);
});

test('emoji incoming: emj.-шифротекст расшифровывается без atob error', async ({ page }) => {
    const seed = 'очень длинная секретная фраза для emoji теста';
    const derived = deriveDerivedKeys(seed);
    const cipherText = encryptForEmoji('Привет, emoji!', derived.k1);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${cipherText}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">
                    <i class="ConvoComposer__buttonIcon ConvoComposer__buttonIcon--submit">→</i>
                </button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveText('Привет, emoji!');
    expect(errors, errors.join('\n')).toEqual([]);
});

test('emoji incoming: VK emoji images в сообщении корректно собираются из alt и расшифровываются', async ({ page }) => {
    const seed = 'очень длинная секретная фраза для emoji img теста';
    const derived = deriveDerivedKeys(seed);
    const cipherText = encryptForEmoji('Привет, emoji img!', derived.k1);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${renderEmojiAsImages(cipherText)}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">
                    <i class="ConvoComposer__buttonIcon ConvoComposer__buttonIcon--submit">→</i>
                </button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveText('Привет, emoji img!');
    expect(errors, errors.join('\n')).toEqual([]);
});

test('encrypt button: по умолчанию шифрует в короткий emoji-формат', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для короткого формата');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
    });

    await setComposerText(page, 'Привет короткий формат');
    await page.locator('#vk-p2p-enc-btn').click();

    await expect.poll(async () => {
        return getComposerText(page);
    }).toMatch(/^𓁗1Ⰴ𐌄Ⱑ/u);
});

test('menu settings: dropdown переключает кодировку на русский алфавит', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для русского алфавита');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
    });

    await page.locator('#vk-p2p-key-btn').click();
    await expect(page.locator('#vk-p2p-cipher-codec-select')).toBeVisible();
    await page.locator('#vk-p2p-cipher-codec-select').selectOption('cyrillic');
    await page.keyboard.press('Escape');

    await setComposerText(page, 'Русский алфавит');
    await page.locator('#vk-p2p-enc-btn').click();

    await expect.poll(async () => getComposerText(page)).toMatch(/^𓁗1Ⰴ𐌓Ⱑ/u);
    const encrypted = await getComposerText(page);

    expect(encrypted).toMatch(/^𓁗1Ⰴ𐌓Ⱑ/u);

    const payload = encrypted.slice('𓁗1Ⰴ𐌓Ⱑ'.length);
    for (const ch of Array.from(payload)) {
        expect(CYRILLIC_ALPHABET.includes(ch)).toBe(true);
    }
});

test('русские слова: markerless пакет расшифровывается только после AES-GCM проверки', async ({ page }) => {
    const seed = 'seed для словарного транспорта';
    const derived = deriveDerivedKeys(seed);
    const [cipherText] = encryptWordPackets('Привет, словарный транспорт!', derived.k1);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ cipherCodec: 'words' })),
        },
        body: `
            <div class="ConvoMessage__text">${cipherText}</div>
            <div class="ConvoMessage__text">вечер причина окно работа дорога</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true" class="ComposerInput__input ConvoComposer__input"
                          role="textbox" aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveText('Привет, словарный транспорт!');
    await expect(page.locator('.ConvoMessage__text').nth(1)).toHaveText('вечер причина окно работа дорога');
    await expect(page.locator('.vk-dec-error')).toHaveCount(0);
});

test('русские слова: фрагменты собираются в одно сообщение после получения всех частей', async ({ page }) => {
    const seed = 'seed для сборки словарных частей';
    const derived = deriveDerivedKeys(seed);
    const plaintext = 'Длинное сообщение для сборки. '.repeat(80);
    const fragments = encryptWordPackets(plaintext, derived.k1, 180);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ cipherCodec: 'words' })),
        },
        body: `${fragments.map(fragment => `<div class="ConvoMessage__text">${fragment}</div>`).join('')}
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput"><span contenteditable="true" class="ComposerInput__input ConvoComposer__input"
                    role="textbox" aria-multiline="true"></span></div>
                <button class="ConvoComposer__button" aria-label="Отправить">→</button>
            </div>`,
    });

    await expect(page.locator('.vk-dec-content')).toHaveText(plaintext);
    expect(await page.locator('.vk-dec-fragment-status').count()).toBe(0);
    expect(await page.locator('.vk-dec-error').count()).toBe(0);
});

test('chat keys: выбранный ключ запоминается отдельно и переключается при SPA-навигации', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для ключей по чатам');
    const storedChatKeys = {
        'vk:peer:101': 'k2',
        'vk:peer:202': 'k3',
        'vk:peer:-239277144': 'k4',
    };

    await openMockChat(page, {
        url: 'https://example.com/convo/101?entrypoint=list_all',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
            vk_p2p_chat_key_slots_v1: JSON.stringify(storedChatKeys),
        },
    });

    await expect(page.locator('#vk-p2p-key-btn')).toHaveAttribute('title', /Сейчас: k2/);

    await page.locator('#vk-p2p-key-btn').click();
    await expect(page.locator('.vk-p2p-menu-item-active')).toContainText('k2');
    await page.locator('.vk-p2p-menu-item').filter({ hasText: 'k4' }).first().click();

    const savedAfterSelection = await page.evaluate(() => {
        return JSON.parse(window.__gmStore.get('vk_p2p_chat_key_slots_v1'));
    });
    expect(savedAfterSelection['vk:peer:101']).toBe('k4');

    await page.evaluate(() => history.pushState({}, '', '/convo/202'));
    await expect(page.locator('#vk-p2p-key-btn')).toHaveAttribute('title', /Сейчас: k3/);

    await page.evaluate(() => history.pushState({}, '', '/convo/303'));
    await expect(page.locator('#vk-p2p-key-btn')).toHaveAttribute('title', /Сейчас: k1/);

    await page.evaluate(() => history.pushState({}, '', '/?sel=-239277144'));
    await expect(page.locator('#vk-p2p-key-btn')).toHaveAttribute('title', /Сейчас: k4/);

    await page.evaluate(() => history.pushState({}, '', '/convo/101'));
    await expect(page.locator('#vk-p2p-key-btn')).toHaveAttribute('title', /Сейчас: k4/);
});

test('auto decrypt off: шифротекст остаётся как есть для всех сообщений', async ({ page }) => {
    const seed = 'seed для отключенной авторасшифровки';
    const derived = deriveDerivedKeys(seed);
    const cipherText = encryptForEmoji('Не трогай меня', derived.k1);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: false })),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${cipherText}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveCount(0);
    await expect(page.locator('.ConvoMessage__text')).toContainText('𓁗1Ⰴ𐌄Ⱑ');
});

test('auto decrypt toggle off: уже расшифрованные сообщения откатываются к шифру', async ({ page }) => {
    const seed = 'seed для toggle off restore';
    const derived = deriveDerivedKeys(seed);
    const cipherText = encryptForEmoji('Верни шифр назад', derived.k1);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true })),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${cipherText}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveText('Верни шифр назад');

    await page.locator('#vk-p2p-key-btn').click();
    await page.getByRole('button', { name: /Авто-расшифровка: включена/i }).click();

    await expect(page.locator('.ConvoMessage__text')).toContainText('𓁗1Ⰴ𐌄Ⱑ');
    await expect(page.locator('.vk-dec-content')).toHaveCount(0);
});

test('invalid new payload: похожий префикс не должен вызывать ошибку расшифровки', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для ложного совпадения');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_custom_keys_v1: JSON.stringify({
                asd: {
                    key: deriveDerivedKeys('custom-asd').k1,
                    label: 'asd',
                },
            }),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗asdⰄ𐌄Ⱑnot-really-encrypted</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveCount(0);
    await expect(page.locator('.ConvoMessage__text')).toContainText('𓁗asdⰄ𐌄Ⱑnot-really-encrypted');
    expect(errors, errors.join('\n')).toEqual([]);
});

test('invalid new base64 payload: битый envelope не должен вызывать atob error', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для битого legacy');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
    });

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌁Ⱑnot-base64!!!!</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toHaveCount(0);
    await expect(page.locator('.ConvoMessage__text')).toContainText('𓁗1Ⰴ𐌁Ⱑnot-base64!!!!');
    expect(errors, errors.join('\n')).toEqual([]);
});

test('decrypt error UI: исходный шифр остаётся, ошибка показывается отдельной строкой', async ({ page }) => {
    const validKey = deriveDerivedKeys('seed для шифрования').k1;
    const wrongSeed = deriveDerivedKeys('seed для красивой ошибки');
    const wrongCipher = encryptForEmoji('ошибка дешифровки', validKey);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(wrongSeed),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${wrongCipher}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-dec-content')).toContainText('𓁗1Ⰴ𐌄Ⱑ');
    await expect(page.locator('.vk-dec-error')).toContainText('ошибка:');
});

test('toggle cipher: клик по [шифр] не пере-расшифровывает сообщение обратно', async ({ page }) => {
    const seed = 'seed для toggle';
    const derived = deriveDerivedKeys(seed);
    const cipherText = encryptForEmoji('Стабильный toggle', derived.k1);

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        body: `
            <div class="ConvoMessage__text">𓁗1Ⰴ𐌄Ⱑ${cipherText}</div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button ConvoComposer__sendButton--mic" aria-label="Отправить">→</button>
            </div>
        `,
    });

    await page.locator('.vk-dec-toggle').click();
    await page.waitForTimeout(50);
    await expect(page.locator('.vk-dec-content')).toContainText('𓁗1Ⰴ𐌄Ⱑ');
    await expect(page.locator('.vk-dec-toggle')).toHaveText('[текст]');
});

test('custom key modal: имя слота принимает кириллицу', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для модалки с кириллицей');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
    });

    await page.locator('#vk-p2p-key-btn').click();
    await page.getByRole('button', { name: /Добавить пользовательский ключ/i }).click();

    await page.locator('#vk-p2p-custom-name').fill('рыба');
    await page.locator('#vk-p2p-custom-key').fill('секретное слово');
    await page.locator('#vk-p2p-custom-save').click();

    await expect(page.locator('.vk-p2p-overlay')).toHaveCount(0);
    await page.locator('#vk-p2p-key-btn').click();
    await expect(page.getByRole('button', { name: /^🔑 рыба \(секретное слово\)$/ })).toBeVisible();
});

test('mobile menu: окно настроек остаётся в пределах viewport и скроллится', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для мобильного меню');
    const customKeys = {};
    for (let i = 0; i < 10; i += 1) {
        customKeys[`slot${i}`] = {
            key: deriveDerivedKeys(`custom-${i}`).k1,
            label: `label-${i}`,
        };
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await openMockChat(page, {
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_custom_keys_v1: JSON.stringify(customKeys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
    });

    await page.locator('#vk-p2p-key-btn').click();
    const styles = await page.locator('.vk-p2p-menu').evaluate(el => {
        const css = getComputedStyle(el);
        return {
            left: parseFloat(css.left),
            top: parseFloat(css.top),
            width: parseFloat(css.width),
            maxHeight: parseFloat(css.maxHeight),
            overflowY: css.overflowY,
        };
    });

    expect(styles.left).toBeGreaterThanOrEqual(0);
    expect(styles.top).toBeGreaterThanOrEqual(0);
    expect(styles.width).toBeLessThanOrEqual(390);
    expect(styles.maxHeight).toBeLessThanOrEqual(844);
    expect(['auto', 'scroll']).toContain(styles.overflowY);
});
