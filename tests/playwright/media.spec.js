const { test, expect } = require('@playwright/test');
const { openMockChat } = require('./helpers');
const {
    MEDIA_CONTAINER_MAGIC,
    deriveDerivedKeys,
    makeBaseSettings,
    buildEncryptedMediaContainer,
} = require('./test-support');

test('media upload: image/audio/video подменяются на encrypted .vke до upload-listener страницы', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для media upload');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ encryptMediaUploads: true })),
        },
        body: `
            <div class="ConvoComposer__inputPanel">
                <button class="ConvoComposer__button" aria-label="Загрузить файл">+</button>
                <input id="vk-media-input" type="file" accept="image/*,audio/*,video/*" multiple>
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

    await page.locator('#vk-media-input').evaluate(input => {
        input.addEventListener('change', async () => {
            window.__mediaUploadInfo = await Promise.all(Array.from(input.files).map(async file => ({
                name: file.name,
                type: file.type,
                size: file.size,
                prefix: Array.from(new Uint8Array(await file.slice(0, 5).arrayBuffer())),
            })));
        });
    });

    await page.locator('#vk-media-input').setInputFiles([
        {
            name: 'photo.png',
            mimeType: 'image/png',
            buffer: Buffer.from('not-a-real-png'),
        },
        {
            name: 'voice.ogg',
            mimeType: 'audio/ogg',
            buffer: Buffer.from('not-a-real-ogg'),
        },
        {
            name: 'movie.mp4',
            mimeType: 'video/mp4',
            buffer: Buffer.from('not-a-real-mp4'),
        },
    ]);

    await expect.poll(async () => page.evaluate(() => window.__mediaUploadInfo || null)).toMatchObject({
        0: { name: 'photo.png.vke', type: 'application/octet-stream' },
        1: { name: 'voice.ogg.vke', type: 'application/octet-stream' },
        2: { name: 'movie.mp4.vke', type: 'application/octet-stream' },
    });

    const info = await page.evaluate(() => window.__mediaUploadInfo);
    info.forEach(item => {
        expect(item.prefix).toEqual(Array.from(Buffer.from(MEDIA_CONTAINER_MAGIC, 'utf8')));
    });
});

test('voice recording: микрофон создаёт .vke и входящее голосовое авторасшифровывается', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для защищённого голосового');

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({
                autoDecrypt: true,
                encryptMediaUploads: true,
            })),
        },
        body: `
            <div class="ConvoComposer__inputPanel">
                <button class="ConvoComposer__button" aria-label="Загрузить файл">+</button>
                <input id="vk-voice-upload" type="file" accept="*/*">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button" aria-label="Выбрать эмодзи">☺</button>
                <button id="vk-native-voice"
                        class="ConvoComposer__button ConvoComposer__sendButton--mic"
                        aria-label="Отправить">🎙</button>
            </div>
        `,
    });

    await page.evaluate(() => {
        window.__nativeVoiceClicks = 0;
        window.__voiceTrackStopped = false;
        document.querySelector('#vk-native-voice').addEventListener('click', () => {
            window.__nativeVoiceClicks += 1;
        });

        const stream = {
            getTracks: () => [{
                stop: () => {
                    window.__voiceTrackStopped = true;
                },
            }],
        };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                getUserMedia: async constraints => {
                    window.__voiceConstraints = constraints;
                    return stream;
                },
            },
        });

        class FakeMediaRecorder extends EventTarget {
            static isTypeSupported(type) {
                return type === 'audio/ogg;codecs=opus';
            }

            constructor(inputStream, options = {}) {
                super();
                this.stream = inputStream;
                this.mimeType = options.mimeType || 'audio/ogg';
                this.state = 'inactive';
            }

            start() {
                this.state = 'recording';
                window.__voiceRecorderState = this.state;
            }

            stop() {
                this.state = 'inactive';
                window.__voiceRecorderState = this.state;
                const dataEvent = new Event('dataavailable');
                Object.defineProperty(dataEvent, 'data', {
                    value: new Blob(['OggSprotected-voice'], { type: 'audio/ogg' }),
                });
                this.dispatchEvent(dataEvent);
                this.dispatchEvent(new Event('stop'));
            }
        }
        window.MediaRecorder = FakeMediaRecorder;

        document.querySelector('#vk-voice-upload').addEventListener('change', async event => {
            const file = event.target.files[0];
            const bytes = new Uint8Array(await file.arrayBuffer());
            window.__voiceEncryptedFile = file;
            window.__voiceUploadInfo = {
                name: file.name,
                type: file.type,
                prefix: Array.from(bytes.slice(0, 5)),
            };
        });
    });

    await page.locator('#vk-native-voice').click();
    await expect.poll(() => page.evaluate(() => window.__voiceRecorderState)).toBe('recording');
    await expect(page.locator('.vk-p2p-voice-status')).toContainText('00:00');
    await expect(page.locator('#vk-native-voice')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#vk-native-voice').click();
    await expect.poll(() => page.evaluate(() => window.__voiceUploadInfo || null)).toMatchObject({
        type: 'application/octet-stream',
        prefix: Array.from(Buffer.from(MEDIA_CONTAINER_MAGIC, 'utf8')),
    });

    const uploadState = await page.evaluate(() => ({
        name: window.__voiceUploadInfo.name,
        nativeClicks: window.__nativeVoiceClicks,
        trackStopped: window.__voiceTrackStopped,
        constraints: window.__voiceConstraints,
    }));
    expect(uploadState.name).toMatch(/^voice-.*\.ogg\.vke$/);
    expect(uploadState.nativeClicks).toBe(0);
    expect(uploadState.trackStopped).toBe(true);
    expect(uploadState.constraints).toEqual({ audio: true });
    await expect(page.locator('.vk-p2p-voice-status')).toHaveCount(0);

    const encryptedVoice = await page.evaluate(async () => {
        const file = window.__voiceEncryptedFile;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });
        return {
            name: file.name,
            dataUrl: `data:application/octet-stream;base64,${btoa(binary)}`,
        };
    });

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({
                autoDecrypt: true,
                encryptMediaUploads: true,
            })),
        },
        body: `
            <div class="ConvoMessage__text">
                <a id="vk-voice-link" href="${encryptedVoice.dataUrl}">${encryptedVoice.name}</a>
            </div>
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button class="ConvoComposer__button" aria-label="Начать запись голосового сообщения">🎙</button>
            </div>
        `,
    });

    await expect(page.locator('.vk-p2p-media-preview audio')).toBeVisible();
    const decryptedText = await page.locator('.vk-p2p-media-preview audio').evaluate(async audio => {
        return new TextDecoder().decode(await (await fetch(audio.src)).arrayBuffer());
    });
    expect(decryptedText).toBe('OggSprotected-voice');
});

test('voice recording: при выключенном шифровании работает штатная кнопка VK', async ({ page }) => {
    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ encryptMediaUploads: false })),
        },
        body: `
            <div class="ConvoComposer__inputPanel">
                <div class="ComposerInput">
                    <span contenteditable="true"
                          class="ComposerInput__input ConvoComposer__input"
                          role="textbox"
                          aria-multiline="true"></span>
                </div>
                <button id="vk-native-voice" class="ConvoComposer__button"
                        aria-label="Начать запись голосового сообщения">🎙</button>
            </div>
        `,
    });

    await page.locator('#vk-native-voice').evaluate(button => {
        window.__nativeVoiceClicks = 0;
        button.addEventListener('click', () => {
            window.__nativeVoiceClicks += 1;
        });
    });

    await page.locator('#vk-native-voice').click();

    expect(await page.evaluate(() => window.__nativeVoiceClicks)).toBe(1);
    await expect(page.locator('.vk-p2p-voice-status')).toHaveCount(0);
});

test('incoming media: .vke attachment auto-decrypts image and exposes download', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для incoming media');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk2QAAAAASUVORK5CYII=',
        'base64'
    );
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'image/png',
        originalName: 'cat.png',
        body: pngBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <div class="ConvoMessage__text">
                <a id="vk-media-link" href="${dataUrl}">cat.png.vke</a>
            </div>
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

    await expect(page.locator('.vk-p2p-media-preview img')).toBeVisible();
    await expect(page.locator('.vk-p2p-media-download')).toHaveAttribute('download', 'cat.png');
    await expect(page.locator('.vk-p2p-media-meta')).toContainText('cat.png');
    await expect(page.locator('#vk-media-link')).toHaveText('cat.png');
    await expect(page.locator('#vk-media-link')).toHaveAttribute('download', 'cat.png');
});

test('incoming media: m.vk AttachDoc card с .vke headline тоже расшифровывается', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для attachdoc');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk2QAAAAASUVORK5CYII=',
        'base64'
    );
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'image/png',
        originalName: 'attachdoc.png',
        body: pngBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://m.vk.com/mail/convo/1',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <article class="ConvoMessage">
                <div class="Attachments ConvoMessage__attachments ConvoMessage__attachments--withoutMarginTop">
                    <a id="vk-attachdoc-link" class="AttachDoc" href="${dataUrl}" target="_blank" rel="noopener noreferrer">
                        <div class="AttachmentCell AttachmentCell--clickable">
                            <div class="AttachmentCell__infoBlockContainer">
                                <div class="AttachmentCell__infoBlock">
                                    <h4 class="AttachmentCell__headline">attachdoc.png.vke</h4>
                                    <span class="AttachmentCell__footnote">VKE ᐧ 61 KB</span>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            </article>
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

    await expect(page.locator('.vk-p2p-media-preview img')).toBeVisible();
    await expect(page.locator('#vk-attachdoc-link .AttachmentCell__headline')).toHaveText('attachdoc.png');
    await expect(page.locator('#vk-attachdoc-link')).toHaveAttribute('download', 'attachdoc.png');
});

test('incoming media: m.vk AttachDoc card с audio .vke даёт audio preview и download', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для attachdoc audio');
    const audioBytes = Buffer.from('OggSfake-audio', 'utf8');
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'audio/ogg',
        originalName: 'attachdoc-voice.ogg',
        body: audioBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://m.vk.com/mail/convo/1',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <article class="ConvoMessage">
                <div class="Attachments ConvoMessage__attachments ConvoMessage__attachments--withoutMarginTop">
                    <a id="vk-attachdoc-audio-link" class="AttachDoc" href="${dataUrl}" target="_blank" rel="noopener noreferrer">
                        <div class="AttachmentCell AttachmentCell--clickable">
                            <div class="AttachmentCell__infoBlockContainer">
                                <div class="AttachmentCell__infoBlock">
                                    <h4 class="AttachmentCell__headline">attachdoc-voice.ogg.vke</h4>
                                    <span class="AttachmentCell__footnote">VKE ᐧ 8 KB</span>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            </article>
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

    await expect(page.locator('.vk-p2p-media-preview audio')).toBeVisible();
    await expect(page.locator('#vk-attachdoc-audio-link .AttachmentCell__headline')).toHaveText('attachdoc-voice.ogg');
    await expect(page.locator('#vk-attachdoc-audio-link')).toHaveAttribute('download', 'attachdoc-voice.ogg');
});

test('incoming media: m.vk AttachDoc card с video .vke даёт video preview и download', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для attachdoc video');
    const videoBytes = Buffer.from('fake-video-binary', 'utf8');
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'video/mp4',
        originalName: 'attachdoc-video.mp4',
        body: videoBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://m.vk.com/mail/convo/1',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <article class="ConvoMessage">
                <div class="Attachments ConvoMessage__attachments ConvoMessage__attachments--withoutMarginTop">
                    <a id="vk-attachdoc-video-link" class="AttachDoc" href="${dataUrl}" target="_blank" rel="noopener noreferrer">
                        <div class="AttachmentCell AttachmentCell--clickable">
                            <div class="AttachmentCell__infoBlockContainer">
                                <div class="AttachmentCell__infoBlock">
                                    <h4 class="AttachmentCell__headline">attachdoc-video.mp4.vke</h4>
                                    <span class="AttachmentCell__footnote">VKE ᐧ 14 KB</span>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            </article>
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

    await expect(page.locator('.vk-p2p-media-preview video')).toBeVisible();
    await expect(page.locator('#vk-attachdoc-video-link .AttachmentCell__headline')).toHaveText('attachdoc-video.mp4');
    await expect(page.locator('#vk-attachdoc-video-link')).toHaveAttribute('download', 'attachdoc-video.mp4');
});

test('incoming media: выключение авторасшифровки убирает preview обратно', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для media toggle off');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk2QAAAAASUVORK5CYII=',
        'base64'
    );
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'image/png',
        originalName: 'toggle.png',
        body: pngBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <div class="ConvoMessage__text">
                <a href="${dataUrl}">toggle.png.vke</a>
            </div>
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

    await expect(page.locator('.vk-p2p-media-preview img')).toBeVisible();

    await page.locator('#vk-p2p-key-btn').click();
    await page.getByRole('button', { name: /Авто-расшифровка: включена/i }).click();

    await expect(page.locator('.vk-p2p-media-preview img')).toHaveCount(0);
    await expect(page.locator('.vk-p2p-media-download')).toBeHidden();
    await expect(page.locator('.ConvoMessage__text a').first()).toHaveText('toggle.png.vke');
});

test('incoming media: .vke attachment auto-decrypts audio and exposes controls', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для incoming audio');
    const audioBytes = Buffer.from('OggSfake-audio', 'utf8');
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'audio/ogg',
        originalName: 'voice.ogg',
        body: audioBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <div class="ConvoMessage__text">
                <a href="${dataUrl}">voice.ogg.vke</a>
            </div>
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

    await expect(page.locator('.vk-p2p-media-preview audio')).toBeVisible();
    await expect(page.locator('.vk-p2p-media-download')).toHaveAttribute('download', 'voice.ogg');
});

test('incoming media: повторная расшифровка использует cache без повторного fetch', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для media cache');
    const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk2QAAAAASUVORK5CYII=',
        'base64'
    );
    const container = buildEncryptedMediaContainer({
        keyHex: derived.k1,
        mime: 'image/png',
        originalName: 'cache.png',
        body: pngBytes,
    });
    const dataUrl = `data:application/octet-stream;base64,${container.toString('base64')}`;

    await openMockChat(page, {
        url: 'https://example.com',
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: false, encryptMediaUploads: true })),
        },
        body: `
            <div class="ConvoMessage__text">
                <a href="${dataUrl}">cache.png.vke</a>
            </div>
            <div class="ConvoMessage__text">
                <a href="${dataUrl}">cache-copy.png.vke</a>
            </div>
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

    await page.evaluate(() => {
        const originalFetch = window.fetch.bind(window);
        window.__mediaFetchCount = 0;
        window.fetch = async (...args) => {
            const url = String(args[0]);
            if (url.startsWith('data:application/octet-stream')) {
                window.__mediaFetchCount += 1;
            }
            return originalFetch(...args);
        };
    });

    await page.locator('.vk-p2p-media-btn').first().click();
    await expect(page.locator('.vk-p2p-media-preview img').first()).toBeVisible();
    await page.locator('.vk-p2p-media-btn').nth(1).click();
    await expect(page.locator('.vk-p2p-media-preview img').nth(1)).toBeVisible();

    await expect.poll(async () => page.evaluate(() => window.__mediaFetchCount)).toBe(1);
});

test('incoming media: Safari cross-origin auto decrypt не уходит в бесконечный цикл ошибок', async ({ page }) => {
    const derived = deriveDerivedKeys('seed для safari media');

    await openMockChat(page, {
        url: 'https://web.vk.me/convo/1',
        disableGMXmlhttpRequest: true,
        gmSeed: {
            vk_p2p_derived_keys_v1: JSON.stringify(derived),
            vk_p2p_settings_v1: JSON.stringify(makeBaseSettings({ autoDecrypt: true, encryptMediaUploads: true })),
        },
        body: `
            <article class="ConvoMessage">
                <div class="Attachments ConvoMessage__attachments ConvoMessage__attachments--withoutMarginTop">
                    <a id="vk-safari-media-link" class="AttachDoc" href="https://psv4.userapi.com/s/v1/d2/test/post_1_png.vke" target="_blank" rel="noopener noreferrer">
                        <div class="AttachmentCell AttachmentCell--clickable">
                            <div class="AttachmentCell__infoBlockContainer">
                                <div class="AttachmentCell__infoBlock">
                                    <h4 class="AttachmentCell__headline">post_1_png.vke</h4>
                                    <span class="AttachmentCell__footnote">VKE ᐧ 1.6 MB</span>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            </article>
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

    await expect(page.locator('.vk-p2p-media-meta')).toContainText('не даёт расшифровать вложения');
    await expect(page.locator('.vk-p2p-media-btn')).toBeHidden();

    const state = await page.locator('.vk-p2p-media-box').evaluate(el => ({
        autoTried: el.dataset.vkP2PAutoTried || null,
        decoded: el.dataset.vkP2PDecoded || null,
    }));

    expect(state.autoTried).toBe('true');
    expect(state.decoded).toBeNull();

    await page.evaluate(() => {
        const marker = document.createElement('div');
        marker.textContent = 'mutation';
        document.body.appendChild(marker);
    });

    await page.waitForTimeout(50);
    await expect(page.locator('.vk-p2p-media-meta')).toContainText('не даёт расшифровать вложения');
    await expect(page.locator('.vk-p2p-media-box')).toHaveCount(1);
});
