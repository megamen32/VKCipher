const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const { openMockChat } = require('./helpers');
const { deriveDerivedKeys, makeBaseSettings } = require('./test-support');

const COMPOSER_BODY = `
    <div class="ConvoComposer__inputPanel">
        <div class="ComposerInput">
            <span contenteditable="true"
                  class="ComposerInput__input ConvoComposer__input"
                  role="textbox"
                  aria-multiline="true"></span>
        </div>
        <button class="ConvoComposer__button ConvoComposer__sendButton--mic"
                aria-label="Начать запись голосового сообщения">🎙</button>
    </div>
`;

const STALE_MIC_LABEL_SEND_BODY = `
    <div class="ConvoComposer__inputPanel">
        <div class="ComposerInput">
            <span contenteditable="true"
                  class="ComposerInput__input ConvoComposer__input"
                  role="textbox"
                  aria-multiline="true"></span>
        </div>
        <button class="ConvoComposer__button ConvoComposer__sendButton--submit"
                aria-label="Начать запись голосового сообщения">
            <i class="ConvoComposer__buttonIcon ConvoComposer__buttonIcon--submit">→</i>
        </button>
    </div>
`;

function makeLongText(prefix) {
    const randomText = crypto.randomBytes(9000).toString('base64');
    return `${prefix} ${randomText}`;
}

async function installSendProbe(page) {
    await page.locator('[contenteditable="true"]').evaluate(input => {
        window.__vkSendProbe = { sent: [], micClicks: 0 };
        input.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            window.__vkSendProbe.sent.push(input.innerText);
            input.innerText = '';
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'deleteContentBackward',
                data: null
            }));
        });
        input.closest('.ConvoComposer__inputPanel')
            .querySelector('[class*="sendButton--mic"]')
            .addEventListener('click', () => {
                window.__vkSendProbe.micClicks += 1;
            });
    });
}

async function getSendProbe(page) {
    return page.evaluate(() => window.__vkSendProbe);
}

async function installStaleLabelSendProbe(page) {
    await page.locator('[contenteditable="true"]').evaluate(input => {
        window.__vkSendProbe = { sent: [], micClicks: 0, getUserMediaCalls: 0 };
        const panel = input.closest('.ConvoComposer__inputPanel');
        const sendButton = panel.querySelector('[class*="sendButton--submit"]');
        sendButton.addEventListener('click', () => {
            window.__vkSendProbe.sent.push(input.innerText);
            input.innerText = '';
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'deleteContentBackward',
                data: null
            }));
        });
        const mediaDevices = navigator.mediaDevices || {};
        if (!navigator.mediaDevices) {
            Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: mediaDevices,
            });
        }
        mediaDevices.getUserMedia = () => {
            window.__vkSendProbe.getUserMediaCalls += 1;
            return Promise.reject(new Error('test-blocked-getUserMedia'));
        };
    });
}

test('long word packet uses Enter chunks and never clicks voice button', async ({ page }) => {
    const keys = deriveDerivedKeys('long message manual seed');
    await openMockChat(page, {
        url: 'https://web.vk.me/convo/1',
        body: COMPOSER_BODY,
        syncTimers: false,
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(keys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ cipherCodec: 'words' })),
        },
    });
    await installSendProbe(page);

    await page.locator('[contenteditable="true"]').fill(makeLongText('ручная-проверка'));
    await page.locator('#vk-p2p-enc-btn').click();
    await page.locator('[contenteditable="true"]').press('Enter');
    await expect.poll(async () => (await getSendProbe(page)).sent.length, { timeout: 10000 })
        .toBeGreaterThan(1);

    const probe = await getSendProbe(page);
    expect(probe.micClicks).toBe(0);
    expect(probe.sent.length).toBeGreaterThan(1);
});

test('auto-encrypted long word packet uses Enter chunks and never clicks voice button', async ({ page }) => {
    const keys = deriveDerivedKeys('long message auto seed');
    await openMockChat(page, {
        url: 'https://web.vk.me/convo/1',
        body: COMPOSER_BODY,
        syncTimers: false,
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(keys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({
                cipherCodec: 'words',
                autoEncrypt: true,
            })),
        },
    });
    await installSendProbe(page);

    await page.locator('[contenteditable="true"]').fill(makeLongText('авто-проверка'));
    await page.locator('[contenteditable="true"]').press('Enter');
    await expect.poll(async () => (await getSendProbe(page)).sent.length, { timeout: 10000 })
        .toBeGreaterThan(1);

    const probe = await getSendProbe(page);
    expect(probe.micClicks).toBe(0);
    expect(probe.sent.length).toBeGreaterThan(1);
});

test('manual encryption sends when VK leaves a stale microphone aria-label on submit button', async ({ page }) => {
    const keys = deriveDerivedKeys('stale microphone label seed');
    await openMockChat(page, {
        url: 'https://example.com',
        body: STALE_MIC_LABEL_SEND_BODY,
        syncTimers: false,
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(keys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ cipherCodec: 'words' })),
        },
    });
    await installStaleLabelSendProbe(page);

    const input = page.locator('[contenteditable="true"]');
    await input.fill('ручной тест после шифрования');
    await page.locator('#vk-p2p-enc-btn').click();
    await expect(input).not.toHaveText('ручной тест после шифрования');
    await page.locator('[class*="sendButton--submit"]').click();
    await expect.poll(async () => (await getSendProbe(page)).sent.length, { timeout: 5000 })
        .toBe(1);

    const probe = await getSendProbe(page);
    expect(probe.getUserMediaCalls).toBe(0);
    expect(probe.sent[0]).toBeTruthy();
});
