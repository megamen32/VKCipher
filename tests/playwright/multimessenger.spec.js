const { test, expect } = require('@playwright/test');
const { openMockChat } = require('./helpers');
const {
    CODEC_MARKERS,
    FORMAT_MID,
    FORMAT_PAYLOAD,
    FORMAT_START,
    deriveDerivedKeys,
    encryptForEmoji,
    makeBaseSettings,
} = require('./test-support');

const SEED = 'multimessenger adapter test seed';
const ADAPTER_CSS = `
    .max-composer, .input-message-container { display:block; width:520px; min-height:56px; }
    .max-composer [contenteditable], .input-message-container [contenteditable] {
        display:block; width:360px; height:32px;
    }
`;

function makeEnvelope(text, keyHex) {
    return `${FORMAT_START}1${FORMAT_MID}${CODEC_MARKERS.emoji}${FORMAT_PAYLOAD}${encryptForEmoji(text, keyHex)}`;
}

async function mockRemotePage(page, origin) {
    await page.route(`${origin}/**`, route => route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head></head><body></body></html>',
    }));
}

test('Max text adapter decrypts incoming message and encrypts composer text', async ({ page }) => {
    const keys = deriveDerivedKeys(SEED);
    await mockRemotePage(page, 'https://web.max.ru');
    await openMockChat(page, {
        url: 'https://web.max.ru/chat/42',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(keys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        syncTimers: false,
        expectVkControls: false,
        forceVkRuntime: false,
        css: ADAPTER_CSS,
        body: `
            <div data-message-id="max-1" class="max-message-bubble">
                <span class="max-message-text">${makeEnvelope('Привет Max', keys.k1)}</span>
            </div>
            <div class="max-composer">
                <div contenteditable="true" role="textbox"></div>
                <button aria-label="Send">→</button>
            </div>
        `,
    });

    await expect(page.locator('.max-message-text')).toHaveText('Привет Max');
    const adapterButton = page.locator('[data-vk-p2p-text-adapter="true"]');
    await expect(adapterButton).toHaveCount(1);
    await page.locator('.max-composer [contenteditable="true"]').fill('Ответ Max');
    await adapterButton.click();
    await expect(page.locator('.max-composer [contenteditable="true"]')).toHaveText(/𓁗1Ⰴ𐌄Ⱑ/u);
});

test('Telegram text adapter decrypts incoming message', async ({ page }) => {
    const keys = deriveDerivedKeys(SEED);
    await mockRemotePage(page, 'https://web.telegram.org');
    await openMockChat(page, {
        url: 'https://web.telegram.org/k/#@test',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(keys),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings()),
        },
        syncTimers: false,
        expectVkControls: false,
        forceVkRuntime: false,
        css: ADAPTER_CSS,
        body: `
            <div data-message-id="telegram-1" class="bubble">
                <div class="text-content">${makeEnvelope('Привет Telegram', keys.k1)}</div>
            </div>
            <div class="input-message-container">
                <div contenteditable="true" role="textbox"></div>
                <button aria-label="Send">→</button>
            </div>
        `,
    });

    await expect(page.locator('.text-content')).toHaveText('Привет Telegram');
    await expect(page.locator('[data-vk-p2p-text-adapter="true"]')).toHaveCount(1);
});
