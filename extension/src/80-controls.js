    // ============================================================
    // Composer controls
    // ============================================================

    function setIconButtonGlyph(button, glyph) {
        if (!button) return;

        let glyphEl = button.querySelector('.vk-p2p-icon-glyph');
        if (!glyphEl) {
            glyphEl = document.createElement('span');
            glyphEl.className = 'vk-p2p-icon-glyph';
            button.replaceChildren(glyphEl);
        }

        glyphEl.textContent = glyph;
    }

    function updateEncryptButtonsTitle() {
        const encBtn = document.getElementById('vk-p2p-enc-btn');
        const keyBtn = document.getElementById('vk-p2p-key-btn');
        const encWrapper = document.getElementById('vk-p2p-enc-controls');
        const hasKeys = hasAnyKeys();
        const shouldHideEncryptButton = settings.autoEncrypt && hasKeys;

        if (encBtn) {
            encBtn.title = hasKeys
                ? `Зашифровать сообщение. Ключ: ${currentKeySlot}`
                : 'Настроить ключи VKEncrypt';

            setIconButtonGlyph(encBtn, hasKeys ? '🔒' : '🔐');
            encBtn.style.opacity = hasKeys ? '0.58' : '0.35';
            encBtn.style.display = shouldHideEncryptButton ? 'none' : '';
        }

        if (encWrapper) {
            encWrapper.style.display = shouldHideEncryptButton ? 'none' : '';
        }

        if (keyBtn) {
            keyBtn.title = hasKeys
                ? `Настройки VKEncrypt. Сейчас: ${currentKeySlot}`
                : 'Настроить VKEncrypt';

            setIconButtonGlyph(keyBtn, !hasKeys
                ? '⚙️'
                : currentKeySlot === '@temp'
                    ? '⚡'
                    : settings.autoEncrypt
                        ? '🟢'
                        : '🔑');
        }
    }

    function addEncryptButton() {
        const inputEl = getComposerInput();
        if (!inputEl) return;

        attachEnterHandler(inputEl);

        const panel = getComposerPanel(inputEl);
        if (!panel) return;

        const sendBtn = findSendButton(panel);
        if (sendBtn) attachSendButtonHandler(sendBtn);

        if (document.getElementById('vk-p2p-enc-controls') && document.getElementById('vk-p2p-key-controls')) {
            updateEncryptButtonsTitle();
            return;
        }

        const keyWrapper = document.createElement('span');
        keyWrapper.id = 'vk-p2p-key-controls';
        keyWrapper.className = 'vk-p2p-controls';

        const encWrapper = document.createElement('span');
        encWrapper.id = 'vk-p2p-enc-controls';
        encWrapper.className = 'vk-p2p-controls';

        const encBtn = document.createElement('button');
        encBtn.id = 'vk-p2p-enc-btn';
        encBtn.className = 'vk-p2p-icon-btn vk-p2p-icon-btn-main';
        encBtn.type = 'button';
        setIconButtonGlyph(encBtn, '🔒');

        const keyBtn = document.createElement('button');
        keyBtn.id = 'vk-p2p-key-btn';
        keyBtn.className = 'vk-p2p-icon-btn vk-p2p-icon-btn-small';
        keyBtn.type = 'button';

        encBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!hasAnyKeys()) {
                showSeedSetupModal();
                return;
            }

            encBtn.disabled = true;
            encBtn.textContent = '⏳';

            try {
                const ok = await encryptCurrentInput({ showErrors: true });
                if (ok) showToast('✅ Сообщение зашифровано');
            } finally {
                encBtn.disabled = false;
                setIconButtonGlyph(encBtn, '🔒');
                updateEncryptButtonsTitle();
            }
        });

        keyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!hasAnyKeys()) {
                showSeedSetupModal();
                return;
            }

            showMainMenu(keyBtn);
        });

        keyWrapper.appendChild(keyBtn);
        encWrapper.appendChild(encBtn);

        const uploadBtn = findUploadButton(panel);
        const emojiBtn = findEmojiButton(panel);
        const uploadReference = getDirectChildWithin(panel, uploadBtn) || uploadBtn;
        const emojiReference = getDirectChildWithin(panel, emojiBtn) || emojiBtn;
        const sendContainer = sendBtn?.closest('.DropdownReforged');
        const sendReference = getDirectChildWithin(panel, sendContainer || sendBtn) || sendContainer || sendBtn;
        const insertReference = getComposerInsertReference(panel, inputEl);

        if (uploadReference && panel.contains(uploadReference)) {
            insertAfterReference(keyWrapper, uploadReference);
        } else if (insertReference?.parentNode) {
            insertReference.parentNode.insertBefore(keyWrapper, insertReference);
        } else {
            panel.insertBefore(keyWrapper, panel.firstChild);
        }

        if (emojiReference && panel.contains(emojiReference)) {
            insertBeforeReference(encWrapper, emojiReference);
        } else if (sendReference && panel.contains(sendReference)) {
            insertBeforeReference(encWrapper, sendReference);
        } else if (insertReference?.parentNode) {
            insertAfterReference(encWrapper, insertReference);
        } else {
            panel.appendChild(encWrapper);
        }

        updateEncryptButtonsTitle();
    }

    function buildShareInstructionText(options = {}) {
        const includeInstallUrl = options.includeInstallUrl !== false;
        const includeCyberChef = options.includeCyberChef !== false;
        const includeNoteServices = options.includeNoteServices !== false;
        const lines = [
            'Я шифрую сообщения через VKEncrypt, чтобы переписка не лежала открытым текстом в VK/MAX/OK и обычных чатах.',
            'Чтобы читать мои сообщения, установи VKEncrypt и введи такой же секретный ключ/seed.'
        ];

        if (includeInstallUrl) {
            lines.push(`Инструкция установки: ${README_URL}`);
            lines.push(`Быстрая ссылка на userscript: ${INSTALL_URL}`);
        }

        if (includeCyberChef) {
            lines.push(`Запасной ручной инструмент для проверки кодировок: CyberChef ${CYBERCHEF_URL}`);
        }

        lines.push('Ключ я отправлю отдельно через защищённый канал связи.');
        lines.push('И мне, и тебе нельзя отправлять ключ в VK, MAX, OK, обычном Telegram-чате, email, SMS или обычной почтой.');

        if (includeNoteServices) {
            lines.push(`Для одноразовой передачи ключа можно использовать: ${ONE_TIME_NOTE_SERVICES.join(' ; ')}`);
        }

        return lines.join('\n');
    }

    function sendPlainTextMessage(text, { sendNow = false } = {}) {
        const inputEl = getComposerInput();

        if (!inputEl) {
            showToast('❌ Не нашёл поле ввода');
            return false;
        }

        setInputPlainText(inputEl, text);

        if (!sendNow) {
            showToast('✅ Инструкция вставлена в поле ввода');
            return true;
        }

        const panel = getComposerPanel(inputEl);
        const sendBtn = findSendButton(panel);

        if (!sendBtn) {
            showToast('⚠️ Инструкция вставлена, но кнопку отправки не нашёл');
            return false;
        }

        skipNextAutoEncrypt = true;
        try {
            sendBtn.click();
            showToast('✅ Инструкция отправлена без шифрования');
            return true;
        } finally {
            setTimeout(() => {
                skipNextAutoEncrypt = false;
            }, 500);
        }
    }

    function showShareInstructionModal() {
        const { overlay, modal } = createModal({
            title: '📨 Скинуть инструкцию',
            bodyHtml: `
                <p>
                    Сообщение будет отправлено открытым текстом, чтобы собеседник смог установить VKEncrypt.
                    Ключ в это сообщение не добавляется.
                </p>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-share-install-url" type="checkbox" checked>
                    <span>Добавить ссылку установки VKEncrypt</span>
                </label>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-share-cyberchef" type="checkbox" checked>
                    <span>Добавить CyberChef как запасной ручной инструмент</span>
                </label>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-share-note-services" type="checkbox" checked>
                    <span>Добавить сервисы для одноразовой передачи ключа</span>
                </label>

                <p class="vk-p2p-note">
                    Автосоздание одноразовой заметки пока выключено: публичные сервисы отличаются API/CORS.
                    Ключ лучше отправлять отдельно и только после проверки сервиса.
                </p>
            `,
            actionsHtml: `
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-share-cancel">Отмена</button>
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-share-insert">Вставить</button>
                <button class="vk-p2p-btn vk-p2p-btn-primary" id="vk-p2p-share-send">Вставить и отправить</button>
            `
        });

        function getText() {
            return buildShareInstructionText({
                includeInstallUrl: modal.querySelector('#vk-p2p-share-install-url').checked,
                includeCyberChef: modal.querySelector('#vk-p2p-share-cyberchef').checked,
                includeNoteServices: modal.querySelector('#vk-p2p-share-note-services').checked
            });
        }

        modal.querySelector('#vk-p2p-share-cancel').addEventListener('click', () => overlay.remove());
        modal.querySelector('#vk-p2p-share-insert').addEventListener('click', () => {
            const text = getText();
            overlay.remove();
            sendPlainTextMessage(text, { sendNow: false });
        });
        modal.querySelector('#vk-p2p-share-send').addEventListener('click', () => {
            const text = getText();
            overlay.remove();
            sendPlainTextMessage(text, { sendNow: true });
        });
    }

    function showMainMenu(anchorBtn) {
        closeMenus();

        const menu = document.createElement('div');
        menu.className = 'vk-p2p-menu';
        menu.style.left = '8px';
        menu.style.top = '8px';
        menu.style.visibility = 'hidden';

        const title = document.createElement('div');
        title.className = 'vk-p2p-menu-title';
        title.textContent = `${APP_NAME} v${APP_VERSION}`;
        menu.appendChild(title);

        const allKeys = getAllKeys();
        const keyNames = Object.keys(allKeys);

        if (keyNames.length) {
            const keyTitle = document.createElement('div');
            keyTitle.className = 'vk-p2p-menu-title';
            keyTitle.textContent = 'Ключ шифрования';
            menu.appendChild(keyTitle);

            keyNames.forEach(slotId => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'vk-p2p-menu-item';

                if (slotId === currentKeySlot) {
                    item.classList.add('vk-p2p-menu-item-active');
                }

                item.textContent = formatKeyDisplay(slotId);
                item.title = slotId === '@temp'
                    ? 'Временный ключ (только в памяти)'
                    : getCustomKeyLabel(slotId)
                        ? `${slotId} — ${getCustomKeyLabel(slotId)}`
                        : slotId;

                item.addEventListener('click', () => {
                    selectKeySlot(slotId, { rememberForChat: true });
                    closeMenus();
                    const chatId = getCurrentChatId();
                    showToast(chatId
                        ? `✅ Для этого чата выбран ключ: ${formatKeyDisplay(slotId)}`
                        : `✅ Выбран ключ: ${formatKeyDisplay(slotId)}`);
                });

                menu.appendChild(item);
            });
        }

        addMenuSeparator(menu);

        addMenuItem(menu, settings.autoEncrypt ? '🟢 Автошифрование: включено' : '⚪ Автошифрование: выключено', () => {
            settings.autoEncrypt = !settings.autoEncrypt;
            saveSettings();
            closeMenus();
            updateEncryptButtonsTitle();
            scan();
            showToast(settings.autoEncrypt ? '✅ Автошифрование включено' : '⏸️ Автошифрование выключено');
        });

        addMenuItem(menu, settings.encryptMediaUploads ? '🎙️ Шифровать вложения и голосовые: включено' : '🎙️ Шифровать вложения и голосовые: выключено', () => {
            settings.encryptMediaUploads = !settings.encryptMediaUploads;
            saveSettings();
            closeMenus();
            showToast(settings.encryptMediaUploads ? '✅ Шифрование вложений и голосовых включено' : '⏸️ Шифрование вложений и голосовых выключено');
        });

        addMenuSelect(
            menu,
            'Кодирование шифротекста',
            'vk-p2p-cipher-codec-select',
            normalizeCodecId(settings.cipherCodec),
            [
                { value: 'emoji', label: 'Emoji' },
                { value: 'cyrillic', label: 'Русский алфавит' },
                { value: 'words', label: 'Русские слова (экспериментально)' },
                { value: 'base64', label: 'Base64' }
            ],
            value => {
                settings.cipherCodec = normalizeCodecId(value);
                saveSettings();
                showToast(`✅ Новые сообщения будут в формате: ${getCipherCodecConfig(settings.cipherCodec).label}`);
            }
        );

        addMenuItem(menu, settings.autoDecrypt ? '👁️ Авто-расшифровка: включена' : '🙈 Авто-расшифровка: выключена', () => {
            settings.autoDecrypt = !settings.autoDecrypt;
            saveSettings();
            closeMenus();
            if (!settings.autoDecrypt) {
                restoreAllIncomingMessages();
                restoreAllIncomingMedia();
            }
            showToast(settings.autoDecrypt ? '✅ Авто-расшифровка включена' : '⏸️ Авто-расшифровка выключена');
            scan();
        });

        addMenuSeparator(menu);

        addMenuItem(menu, '➕ Добавить пользовательский ключ', () => {
            closeMenus();
            showAddCustomKeyModal();
        });

        addMenuItem(menu, '⚡ Сгенерировать временный ключ', () => {
            closeMenus();
            generateTempKey();
        });

        addMenuItem(menu, '🔄 Сменить seed-фразу k1–k4', () => {
            closeMenus();
            showSeedChangeModal();
        });

        addMenuItem(menu, '📨 Скинуть инструкцию по установке', () => {
            closeMenus();
            showShareInstructionModal();
        });

        if (TEMP_KEY) {
            addMenuItem(menu, '🧹 Удалить временный ключ', () => {
                TEMP_KEY = null;
                forgetChatKeySlot('@temp');
                if (currentKeySlot === '@temp') currentKeySlot = getFallbackKeySlot();
                closeMenus();
                updateEncryptButtonsTitle();
                showToast('✅ Временный ключ удалён');
            });
        }

        const customKeyNames = Object.keys(CUSTOM_KEYS);
        if (customKeyNames.length) {
            addMenuSeparator(menu);

            customKeyNames.forEach(name => {
                const label = getCustomKeyLabel(name);
                const display = label
                    ? `${name} (${truncateForDisplay(label)})`
                    : name;

                addMenuItem(menu, `🗑️ Удалить ключ ${display}`, () => {
                    if (!confirm(`Удалить пользовательский ключ "${name}"?`)) return;

                    delete CUSTOM_KEYS[name];
                    saveCustomKeys();
                    forgetChatKeySlot(name);

                    if (currentKeySlot === name) currentKeySlot = getFallbackKeySlot();

                    closeMenus();
                    updateEncryptButtonsTitle();
                    showToast(`✅ Ключ ${name} удалён`);
                }, true);
            });
        }

        addMenuSeparator(menu);

        addMenuItem(menu, '🧨 Сбросить все сохранённые ключи', () => {
            if (!confirm('Удалить сохранённые k1–k4 и все пользовательские ключи?')) return;

            closeMenus();
            resetAllKeys();
            showToast('✅ Сохранённые ключи сброшены');
        }, true);

        document.body.appendChild(menu);
        positionMenu(menu, anchorBtn);

        setTimeout(() => {
            document.addEventListener('click', function closeOnce(e) {
                if (!menu.contains(e.target) && e.target !== anchorBtn) {
                    menu.remove();
                }
            }, { once: true });
        }, 0);
    }

    function addMenuItem(menu, text, onClick, danger = false) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'vk-p2p-menu-item';

        if (danger) item.classList.add('vk-p2p-menu-danger');

        item.textContent = text;
        item.addEventListener('click', onClick);

        menu.appendChild(item);
        return item;
    }

    function addMenuSelect(menu, label, id, value, options, onChange) {
        const field = document.createElement('div');
        field.className = 'vk-p2p-menu-field';

        const labelEl = document.createElement('label');
        labelEl.className = 'vk-p2p-menu-label';
        labelEl.htmlFor = id;
        labelEl.textContent = label;

        const select = document.createElement('select');
        select.className = 'vk-p2p-menu-select';
        select.id = id;

        options.forEach(option => {
            const item = document.createElement('option');
            item.value = option.value;
            item.textContent = option.label;
            select.appendChild(item);
        });

        select.value = value;
        select.addEventListener('change', () => onChange(select.value));

        field.appendChild(labelEl);
        field.appendChild(select);
        menu.appendChild(field);
        return select;
    }

    function addMenuSeparator(menu) {
        const sep = document.createElement('div');
        sep.className = 'vk-p2p-menu-sep';
        menu.appendChild(sep);
    }

    function positionMenu(menu, anchorBtn) {
        const rect = anchorBtn.getBoundingClientRect();
        const margin = 8;
        const availableHeight = window.innerHeight - margin * 2;

        menu.style.maxHeight = `${availableHeight}px`;

        const menuRect = menu.getBoundingClientRect();
        const width = menuRect.width;
        const height = Math.min(menuRect.height, availableHeight);

        if (menuRect.height > availableHeight) {
            menu.style.height = `${availableHeight}px`;
        } else {
            menu.style.height = '';
        }
        const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
        const preferredTop = rect.top - height - margin;
        const fallbackTop = rect.bottom + margin;
        const top = preferredTop >= margin
            ? preferredTop
            : Math.min(fallbackTop, window.innerHeight - height - margin);

        menu.style.left = `${left}px`;
        menu.style.top = `${Math.max(margin, top)}px`;
        menu.style.visibility = 'visible';
    }
