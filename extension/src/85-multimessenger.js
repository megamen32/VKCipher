    // ============================================================
    // Text adapters for Max and Telegram Web.
    // They reuse the VKEncrypt crypto/key functions from the outer runtime.
    // ============================================================

    (function initTextMessengerAdapter() {
        const host = location.hostname.toLowerCase();
        const adapterId = host === 'max.ru' || host.endsWith('.max.ru')
            ? 'max'
            : host === 'web.telegram.org' || host.endsWith('.telegram.org')
                ? 'telegram'
                : '';

        if (!adapterId) return;

        const state = {
            autoEncrypt: false,
            busy: false,
            lastChatId: '',
            scanPending: false,
            scanTimer: null
        };

        function getChatId() {
            const url = new URL(location.href);
            const query = ['chat', 'peer', 'conversation', 'id']
                .map(name => url.searchParams.get(name))
                .find(Boolean);
            const pathMatch = /\/(?:chat|im|conversation|c)\/([^/?#]+)/i.exec(url.pathname);
            const hash = url.hash.replace(/^#/, '');
            const raw = query || pathMatch?.[1] || hash || url.pathname;
            return `${adapterId}:${String(raw || '/').slice(0, 160)}`;
        }

        function findComposer() {
            const selectors = [
                '[contenteditable="true"][role="textbox"]',
                '[contenteditable="true"]',
                'textarea[placeholder]'
            ];

            for (const selector of selectors) {
                const element = Array.from(document.querySelectorAll(selector)).find(candidate => {
                    const rect = candidate.getBoundingClientRect();
                    return rect.width > 40 && rect.height > 10 && candidate.offsetParent !== null;
                });
                if (element) return element;
            }

            return null;
        }

        function getComposerText(input) {
            return 'value' in input ? input.value.trim() : input.innerText.trim();
        }

        function setComposerText(input, text) {
            if ('value' in input) {
                input.value = text;
            } else {
                input.innerText = text;
            }
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: text
            }));
        }

        function findSendButton(input) {
            const root = input?.closest('form, [class*="composer"], [class*="Composer"], [class*="input"]');
            const scope = root || document;
            return Array.from(scope.querySelectorAll('button, [role="button"]')).find(button => {
                const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
                return /отправ|send|послать/.test(label) && button.offsetParent !== null;
            }) || null;
        }

        function getMessageText(element) {
            const textNode = element.querySelector(
                '[data-message-text], [class*="message-text"], [class*="MessageText"], [class*="text-content"]'
            );
            return (textNode || element).innerText.trim();
        }

        function findMessages() {
            const candidates = Array.from(document.querySelectorAll(
                '[data-message-id], [data-mid], [role="listitem"], article, [class*="message"], [class*="Message"]'
            ));
            return candidates.filter(element => {
                if (element.closest('form, [contenteditable="true"]')) return false;
                if (element.dataset.vkP2PTextAdapterDone === 'true') return false;
                const text = getMessageText(element);
                return text.startsWith(FORMAT_START) && text.length > 12;
            });
        }

        async function decryptIncoming() {
            const keys = getAllKeys();
            if (!Object.keys(keys).length || settings.autoDecrypt === false) return;

            for (const message of findMessages()) {
                const original = getMessageText(message);
                const parsed = parseEncryptedMessage(original);
                if (!parsed) {
                    message.dataset.vkP2PTextAdapterDone = 'true';
                    continue;
                }

                const keyHex = keys[parsed.keyId];
                if (!keyHex) continue;

                try {
                    const payload = decodePayloadForCodec(parsed.encodedPayload, parsed.codecId);
                    const plaintext = await decryptAESGCM(payload, keyHex);
                    const textNode = message.querySelector(
                        '[data-message-text], [class*="message-text"], [class*="MessageText"], [class*="text-content"]'
                    ) || message;
                    textNode.textContent = plaintext;
                    message.dataset.vkP2PTextAdapterDone = 'true';
                    message.dataset.vkP2POriginalCipher = original;
                    message.title = `VKEncrypt: ${adapterId}`;
                } catch {
                    // A foreign envelope remains untouched.
                }
            }
        }

        async function encryptComposer(input) {
            if (state.busy || !input) return false;
            const plaintext = getComposerText(input);
            const keyHex = getCurrentKeyHex();
            if (!plaintext || !keyHex) return false;

            state.busy = true;
            try {
                const codecId = settings.cipherCodec === 'base64' ? 'base64' : 'emoji';
                const encoded = encodePayloadForCodec(await encryptAESGCM(plaintext, keyHex), codecId);
                const envelope = formatEncryptedMessage(currentKeySlot, encoded, codecId);
                setComposerText(input, envelope);
                return true;
            } finally {
                state.busy = false;
            }
        }

        function ensureControls(input) {
            const parent = input?.closest('form, [class*="composer"], [class*="Composer"], [class*="input"]') || input?.parentElement;
            const existing = parent?.querySelector('[data-vk-p2p-text-adapter="true"]');
            if (!input || existing) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-vk-p2p-text-adapter', 'true');
            button.textContent = '🔒';
            button.title = `${adapterId}: автошифрование выключено`;
            button.style.cssText = 'margin:4px; padding:4px 8px; cursor:pointer;';
            button.addEventListener('click', async () => {
                const currentInput = findComposer();
                if (!currentInput || !hasAnyKeys()) {
                    showSeedSetupModal();
                    return;
                }
                state.autoEncrypt = !state.autoEncrypt;
                button.textContent = state.autoEncrypt ? '🔐' : '🔒';
                button.title = `${adapterId}: автошифрование ${state.autoEncrypt ? 'включено' : 'выключено'}`;
                if (state.autoEncrypt) await encryptComposer(currentInput);
            });

            const sendButton = findSendButton(input);
            const insertParent = sendButton?.parentElement || parent;
            insertParent?.insertBefore(button, sendButton || null);
        }

        async function onKeyDown(event) {
            if (event.key !== 'Enter' || event.shiftKey || !state.autoEncrypt || state.busy) return;
            const input = findComposer();
            if (!input || (event.target !== input && !input.contains(event.target)) || !getComposerText(input)) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            const encrypted = await encryptComposer(input);
            if (!encrypted) return;

            state.busy = true;
            try {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            } finally {
                setTimeout(() => {
                    state.busy = false;
                }, 0);
            }
        }

        function scan() {
            const input = findComposer();
            const chatId = getChatId();
            if (chatId !== state.lastChatId) {
                state.lastChatId = chatId;
                state.autoEncrypt = false;
            }
            ensureControls(input);
            void decryptIncoming();
        }

        document.addEventListener('keydown', event => {
            void onKeyDown(event);
        }, true);

        function scheduleScan() {
            if (state.scanPending || state.scanTimer !== null) return;
            state.scanPending = true;
            state.scanTimer = setTimeout(() => {
                state.scanTimer = null;
                state.scanPending = false;
                scan();
            }, 0);
        }

        const observer = new MutationObserver(() => scheduleScan());
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleScan();
        console.log(`🔐 VKEncrypt text adapter loaded: ${adapterId}`);
    })();
