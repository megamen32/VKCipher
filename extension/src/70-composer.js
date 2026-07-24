    // ============================================================
    // Composer helpers
    // ============================================================

    function getComposerInput() {
        const selectors = [
            '.ComposerInput__input.ConvoComposer__input[contenteditable="true"]',
            '.ConvoComposer__input[contenteditable="true"]',
            '.im-editable[contenteditable="true"]',
            '[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const list = Array.from(document.querySelectorAll(selector));
            const visible = list.find(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 20 && rect.height > 10;
            });

            if (visible) return visible;
        }

        return null;
    }

    function getComposerPanel(inputEl) {
        if (!inputEl) return null;

        const knownPanel = inputEl.closest(
            '.ConvoComposer__inputPanel, .ConvoComposer, .im-compose, .im-chat-input, form'
        );

        if (knownPanel) return knownPanel;

        let node = inputEl.parentElement;

        while (node && node !== document.body) {
            const rect = node.getBoundingClientRect();
            const hasComposerButtons = Boolean(node.querySelector(
                'button, [role="button"], [aria-label*="Загрузить файл"], [aria-label*="эмодзи"], [aria-label*="голосового"]'
            ));

            if (hasComposerButtons && rect.width > 80 && rect.height > 20) {
                return node;
            }

            node = node.parentElement;
        }

        return inputEl.parentElement;
    }

    function findSendButton(panel) {
        const root = panel || document;

        const selectors = [
            '.ConvoComposer__buttonIcon--submit',
            'button[aria-label*="Отправить"]',
            '[aria-label*="Отправить"]',
            'button[type="submit"]',
            '.im-send-btn'
        ];

        for (const selector of selectors) {
            const found = root.querySelector(selector);
            if (!found) continue;

            const button = found.closest('button, [role="button"], a, div') || found;
            const rect = button.getBoundingClientRect();
            const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();

            if (/голос|микрофон|voice|record/.test(label)) continue;

            if (rect.width > 0 && rect.height > 0) {
                return button;
            }
        }

        const icon = root.querySelector('svg.vkuiIcon--send_24, .vkuiIcon--send_24');
        if (icon) {
            const button = icon.closest('button, [role="button"], a, div') || icon;
            const label = `${button.getAttribute?.('aria-label') || ''} ${button.getAttribute?.('title') || ''}`.toLowerCase();
            if (!/голос|микрофон|voice|record/.test(label)) return button;
        }

        return null;
    }

    function waitForComposerClear(inputEl, previousText, timeoutMs = 1200) {
        const isAccepted = () => !inputEl?.isConnected || getInputPlainText(inputEl) !== previousText;

        if (!inputEl || isAccepted()) {
            return Promise.resolve(true);
        }

        return new Promise(resolve => {
            let settled = false;
            let observer;

            const finish = accepted => {
                if (settled) return;
                settled = true;
                observer?.disconnect();
                resolve(accepted);
            };

            observer = new MutationObserver(() => {
                if (isAccepted()) finish(true);
            });
            observer.observe(inputEl, {
                childList: true,
                subtree: true,
                characterData: true
            });

            if (isAccepted()) {
                finish(true);
                return;
            }

            setTimeout(() => finish(isAccepted()), timeoutMs);
        });
    }

    async function triggerComposerSend(inputEl, panel, { verify = false } = {}) {
        const previousText = getInputPlainText(inputEl);
        const sendBtn = findSendButton(panel);

        if (sendBtn) {
            sendBtn.click();
        } else if (inputEl) {
            inputEl.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        } else {
            return false;
        }

        return verify ? waitForComposerClear(inputEl, previousText) : true;
    }

    function findComposerButton(panel, labels) {
        const root = panel || document;

        for (const label of labels) {
            const selector = [
                `button[aria-label*="${label}"]`,
                `[role="button"][aria-label*="${label}"]`,
                `[aria-label*="${label}"]`
            ].join(',');

            const found = root.querySelector(selector);
            if (!found) continue;

            const button = found.closest('button, [role="button"], a, div') || found;
            const rect = button.getBoundingClientRect();

            if (rect.width > 0 && rect.height > 0) {
                return button;
            }
        }

        return null;
    }

    function findUploadButton(panel) {
        return findComposerButton(panel, [
            'Загрузить файл',
            'Прикрепить',
            'прикрепить',
            'файл'
        ]);
    }

    function findEmojiButton(panel) {
        return findComposerButton(panel, [
            'эмодзи',
            'Эмодзи',
            'стикер',
            'Стикер'
        ]);
    }

    function getDirectChildWithin(parent, child) {
        if (!parent || !child || !parent.contains(child)) return null;

        let node = child;
        while (node.parentElement && node.parentElement !== parent) {
            node = node.parentElement;
        }

        return node.parentElement === parent ? node : null;
    }

    function insertAfterReference(node, reference) {
        if (!node || !reference?.parentNode) return false;
        reference.parentNode.insertBefore(node, reference.nextSibling);
        return true;
    }

    function insertBeforeReference(node, reference) {
        if (!node || !reference?.parentNode) return false;
        reference.parentNode.insertBefore(node, reference);
        return true;
    }

    function getComposerInsertReference(panel, inputEl) {
        if (!panel || !inputEl) return null;

        let node = inputEl;

        while (node.parentElement && node.parentElement !== panel) {
            node = node.parentElement;
        }

        return node.parentElement === panel ? node : inputEl;
    }

    function getInputPlainText(inputEl) {
        if (!inputEl) return '';

        if ('value' in inputEl) {
            return inputEl.value.trim();
        }

        return inputEl.innerText.trim();
    }

    function setInputPlainText(inputEl, text) {
        if (!inputEl) return;

        inputEl.focus();

        if ('value' in inputEl) {
            inputEl.value = text;
        } else {
            inputEl.innerText = text;

            const range = document.createRange();
            const sel = window.getSelection();

            range.selectNodeContents(inputEl);
            range.collapse(false);

            sel.removeAllRanges();
            sel.addRange(range);
        }

        inputEl.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: text
        }));

        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function isComposerFileInput(inputEl) {
        if (!inputEl || inputEl.type !== 'file') return false;
        if (!getComposerInput()) return false;

        const accept = String(inputEl.accept || '').toLowerCase();
        return (
            accept.includes('image') ||
            accept.includes('audio') ||
            accept.includes('video') ||
            accept.includes('*/*') ||
            accept === ''
        );
    }

    async function handleMediaFileInputChange(event) {
        const inputEl = event.target;

        if (!(inputEl instanceof HTMLInputElement) || inputEl.type !== 'file') return;
        if (inputEl.dataset.vkP2PMediaSynthetic === 'true') {
            delete inputEl.dataset.vkP2PMediaSynthetic;
            return;
        }
        if (!settings.encryptMediaUploads) return;
        if (!isComposerFileInput(inputEl)) return;

        const files = Array.from(inputEl.files || []);
        if (!files.length) return;

        const hasMedia = files.some(file => isEncryptableMediaFile(file));
        if (!hasMedia) return;

        if (!hasAnyKeys()) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            inputEl.value = '';
            showSeedSetupModal();
            return;
        }

        const keyHex = getCurrentKeyHex();
        if (!keyHex) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            showToast(`❌ Ключ "${currentKeySlot}" не найден`);
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        try {
            const outputFiles = [];

            for (const file of files) {
                if (isEncryptableMediaFile(file)) {
                    outputFiles.push(await buildEncryptedMediaFile(file, keyHex, currentKeySlot));
                } else {
                    outputFiles.push(file);
                }
            }

            const dataTransfer = new DataTransfer();
            outputFiles.forEach(file => dataTransfer.items.add(file));
            inputEl.files = dataTransfer.files;
            inputEl.dataset.vkP2PMediaSynthetic = 'true';
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));

            const mediaCount = outputFiles.filter(file => isEncryptedMediaName(file.name)).length;
            showToast(`✅ Зашифровал вложения до отправки: ${mediaCount}`);
        } catch (err) {
            inputEl.value = '';
            showToast(`❌ Не удалось зашифровать вложения: ${err.message}`);
        }
    }

    async function encryptCurrentInput({ showErrors = true } = {}) {
        if (!hasAnyKeys()) {
            showSeedSetupModal();
            return false;
        }

        const inputEl = getComposerInput();

        if (!inputEl) {
            if (showErrors) showToast('❌ Не нашёл поле ввода');
            return false;
        }

        const plainText = getInputPlainText(inputEl);

        if (!plainText) return false;

        if (parseEncryptedMessage(plainText)) {
            return true;
        }

        const keyHex = getCurrentKeyHex();

        if (!keyHex) {
            if (showErrors) showToast(`❌ Ключ "${currentKeySlot}" не найден`);
            return false;
        }

        try {
            const codecId = normalizeCodecId(settings.cipherCodec);

            if (codecId === 'words') {
                const messages = await encodePlaintextToWordMessages(plainText, keyHex);
                pendingWordMessages = messages.slice(1);
                pendingWordChatId = getCurrentChatId();
                setInputPlainText(inputEl, messages[0]);
                lastEncryptedAt = Date.now();
                if (messages.length > 1) {
                    showToast(`✅ Сообщение разбито на ${messages.length} частей`);
                }
                return true;
            }

            const b64 = await encryptAESGCM(plainText, keyHex);
            pendingWordMessages = [];
            pendingWordChatId = '';
            const payload = encodePayloadForCodec(b64, codecId);
            const encryptedMsg = formatEncryptedMessage(currentKeySlot, payload, codecId);

            setInputPlainText(inputEl, encryptedMsg);
            lastEncryptedAt = Date.now();

            return true;
        } catch (err) {
            console.error('❌ Ошибка шифрования:', err);
            if (showErrors) showToast('❌ Не удалось зашифровать: ' + err.message);
            return false;
        }
    }

    async function sendPendingWordMessages() {
        while (pendingWordMessages.length) {
            const inputEl = getComposerInput();
            const panel = getComposerPanel(inputEl);
            if (!inputEl) {
                showToast('⚠️ Не удалось отправить оставшиеся части');
                return;
            }

            if (pendingWordChatId && getCurrentChatId() !== pendingWordChatId) {
                pendingWordMessages = [];
                pendingWordChatId = '';
                showToast('⚠️ Отправка отменена: открыт другой чат');
                return;
            }

            const nextMessage = pendingWordMessages[0];
            setInputPlainText(inputEl, nextMessage);
            const accepted = await triggerComposerSend(inputEl, panel, { verify: true });
            if (!accepted) {
                showToast('⚠️ VK не подтвердил отправку части сообщения');
                return;
            }

            pendingWordMessages.shift();
            await new Promise(resolve => setTimeout(resolve, 220));
        }

        pendingWordChatId = '';
    }

    async function autoEncryptAndSend(event) {
        if (skipNextAutoEncrypt) return;
        if (!settings.autoEncrypt) return;
        if (isAutoSending) return;

        if (!hasAnyKeys()) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
            }
            showSeedSetupModal();
            return;
        }

        const inputEl = getComposerInput();
        if (!inputEl) return;

        const plainText = getInputPlainText(inputEl);
        if (!plainText) return;

        if (parseEncryptedMessage(plainText)) {
            return;
        }

        if (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }

        const ok = await encryptCurrentInput({ showErrors: true });
        if (!ok) return;

        isAutoSending = true;

        setTimeout(async () => {
            try {
                const freshInput = getComposerInput();
                const panel = getComposerPanel(freshInput);

                if (freshInput) {
                    if (pendingWordChatId && getCurrentChatId() !== pendingWordChatId) {
                        pendingWordMessages = [];
                        pendingWordChatId = '';
                        showToast('⚠️ Отправка отменена: открыт другой чат');
                        return;
                    }

                    const accepted = await triggerComposerSend(freshInput, panel, { verify: true });
                    if (!accepted) {
                        showToast('⚠️ VK не подтвердил отправку зашифрованного сообщения');
                    } else if (pendingWordMessages.length) {
                        setTimeout(() => {
                            sendPendingWordMessages();
                        }, 260);
                    }
                } else {
                    showToast('⚠️ Зашифровал, но не нашёл кнопку отправки');
                }
            } finally {
                setTimeout(() => {
                    isAutoSending = false;
                }, 300);
            }
        }, 120);
    }

    function handleComposerKeydown(e) {
        if (skipNextAutoEncrypt) return;

        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey &&
            pendingWordMessages.length && !settings.autoEncrypt && !isAutoSending) {
            isAutoSending = true;
            setTimeout(() => {
                sendPendingWordMessages().finally(() => {
                    isAutoSending = false;
                });
            }, 260);
            return;
        }

        if (!settings.autoEncrypt) return;
        if (e.key !== 'Enter') return;

        // Shift+Enter оставляем для переноса строки.
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

        autoEncryptAndSend(e);
    }

    function attachEnterHandler(inputEl) {
        if (!inputEl || inputEl.dataset.vkP2PEnterAttached === 'true') return;

        inputEl.dataset.vkP2PEnterAttached = 'true';
        inputEl.addEventListener('keydown', handleComposerKeydown, true);
    }

    function attachSendButtonHandler(sendBtn) {
        if (!sendBtn || sendBtn.dataset.vkP2PSendAttached === 'true') return;

        sendBtn.dataset.vkP2PSendAttached = 'true';

        sendBtn.addEventListener('click', (e) => {
            if (pendingWordMessages.length && !settings.autoEncrypt && !isAutoSending) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                isAutoSending = true;
                sendBtn.click();
                setTimeout(() => {
                    sendPendingWordMessages().finally(() => {
                        isAutoSending = false;
                    });
                }, 260);
                return;
            }

            if (skipNextAutoEncrypt) return;
            if (!settings.autoEncrypt) return;
            if (isAutoSending) return;

            const now = Date.now();

            // Если только что зашифровали вручную, не мешаем отправке.
            if (now - lastEncryptedAt < 250) return;

            autoEncryptAndSend(e);
        }, true);
    }
