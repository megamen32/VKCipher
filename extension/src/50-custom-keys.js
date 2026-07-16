    // ============================================================
    // Custom key modals
    // ============================================================

    function showAddCustomKeyModal() {
        const { overlay, modal } = createModal({
            title: '➕ Пользовательский ключ',
            bodyHtml: `
                <p>
                    Введи имя для слота и <b>64 hex-символа</b> — или просто любое слово
                    (например, «собака»). Из слова скрипт детерминированно выведет
                    256-битный ключ. Собеседнику нужно ввести то же слово.
                </p>

                <input class="vk-p2p-input" id="vk-p2p-custom-name"
                    placeholder="Имя слота, например k5, друг или friend1">

                <div style="height:8px"></div>

                <textarea class="vk-p2p-textarea" id="vk-p2p-custom-key"
                    placeholder="64 hex-символа ИЛИ любое слово: собака, мой-друг, ..."></textarea>

                <p class="vk-p2p-note">
                    Имя слота может быть и на кириллице. Подходят буквы любого алфавита, цифры, _, -, . и @.
                </p>

                <p class="vk-p2p-error" id="vk-p2p-custom-error"></p>
            `,
            actionsHtml: `
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-custom-cancel">Отмена</button>
                <button class="vk-p2p-btn vk-p2p-btn-primary" id="vk-p2p-custom-save">Сохранить</button>
            `
        });

        const nameInput = modal.querySelector('#vk-p2p-custom-name');
        const keyInput = modal.querySelector('#vk-p2p-custom-key');
        const error = modal.querySelector('#vk-p2p-custom-error');
        const saveBtn = modal.querySelector('#vk-p2p-custom-save');
        const cancelBtn = modal.querySelector('#vk-p2p-custom-cancel');

        setTimeout(() => nameInput.focus(), 80);

        cancelBtn.addEventListener('click', () => overlay.remove());

        async function handleSave() {
            let name = nameInput.value.trim();
            const keyOrWord = keyInput.value.trim();

            if (!name) {
                error.textContent = 'Введите имя ключа.';
                error.style.display = 'block';
                return;
            }

            name = name.replace(/\s+/g, '_');

            if (['k1', 'k2', 'k3', 'k4', '@temp'].includes(name)) {
                error.textContent = 'Это имя зарезервировано. Используй другое.';
                error.style.display = 'block';
                return;
            }

            if (!/^[\p{L}\p{N}_.@-]{1,32}$/u.test(name)) {
                error.textContent = 'Имя может содержать буквы любого алфавита, цифры, _, -, . и @. До 32 символов.';
                error.style.display = 'block';
                return;
            }

            if (!keyOrWord) {
                error.textContent = 'Введите 64 hex-символа или любое слово.';
                error.style.display = 'block';
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Создаю...';

            try {
                let keyHex;
                let label = '';

                if (isValidKeyHex(keyOrWord)) {
                    keyHex = keyOrWord.toLowerCase();
                } else {
                    keyHex = await deriveKeyFromName(keyOrWord);
                    label = keyOrWord;
                }

                CUSTOM_KEYS[name] = { key: keyHex, label };
                saveCustomKeys();
                currentKeySlot = name;

                overlay.remove();
                updateEncryptButtonsTitle();
                scan();

                const tag = label ? ` «${truncateForDisplay(label, 24)}»` : '';
                showToast(`✅ ${name}${tag} сохранён`);
            } catch (err) {
                error.textContent = 'Ошибка: ' + err.message;
                error.style.display = 'block';
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Сохранить';
            }
        }

        saveBtn.addEventListener('click', handleSave);

        keyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSave();
            }
        });
    }

    async function generateTempKey() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const keyHex = bytesToHex(bytes);

        TEMP_KEY = keyHex;
        currentKeySlot = '@temp';

        updateEncryptButtonsTitle();
        scan();

        try {
            await navigator.clipboard.writeText(keyHex);
            showToast('✅ Временный ключ создан и скопирован');
        } catch {
            showGeneratedKeyModal(keyHex);
        }
    }

    function showGeneratedKeyModal(keyHex) {
        const { overlay, modal } = createModal({
            title: '⚡ Новый временный ключ',
            bodyHtml: `
                <p>
                    Ключ создан и применён. Скопируй его и передай собеседнику.
                    Он исчезнет при перезагрузке страницы.
                </p>

                <textarea class="vk-p2p-textarea" id="vk-p2p-generated-key" readonly>${keyHex}</textarea>
            `,
            actionsHtml: `
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-generated-close">Закрыть</button>
                <button class="vk-p2p-btn vk-p2p-btn-primary" id="vk-p2p-generated-copy">Скопировать</button>
            `
        });

        const output = modal.querySelector('#vk-p2p-generated-key');

        setTimeout(() => {
            output.focus();
            output.select();
        }, 80);

        modal.querySelector('#vk-p2p-generated-close').addEventListener('click', () => overlay.remove());

        modal.querySelector('#vk-p2p-generated-copy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(keyHex);
                overlay.remove();
                showToast('✅ Ключ скопирован');
            } catch {
                output.focus();
                output.select();
            }
        });
    }

    function showSeedChangeModal() {
        const { overlay, modal } = createModal({
            title: '🔄 Сменить seed-фразу',
            bodyHtml: `
                <p>
                    Будут заново созданы ключи <b>k1–k4</b>. Старые сохранённые k1–k4 будут заменены.
                    Пользовательские ключи не удаляются.
                </p>

                <div class="vk-p2p-row">
                    <input class="vk-p2p-input" id="vk-p2p-change-seed-input" type="password"
                        placeholder="Новая секретная фраза">
                    <button class="vk-p2p-btn vk-p2p-btn-secondary vk-p2p-eye-btn" id="vk-p2p-change-seed-eye" type="button">👁️</button>
                </div>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-change-save" type="checkbox" checked>
                    <span>Сохранить производные ключи на этом устройстве</span>
                </label>

                <p class="vk-p2p-error" id="vk-p2p-change-seed-error"></p>
            `,
            actionsHtml: `
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-change-cancel">Отмена</button>
                <button class="vk-p2p-btn vk-p2p-btn-primary" id="vk-p2p-change-apply">Сменить</button>
            `
        });

        const input = modal.querySelector('#vk-p2p-change-seed-input');
        const eyeBtn = modal.querySelector('#vk-p2p-change-seed-eye');
        const error = modal.querySelector('#vk-p2p-change-seed-error');
        const saveCheckbox = modal.querySelector('#vk-p2p-change-save');
        const applyBtn = modal.querySelector('#vk-p2p-change-apply');

        attachPasswordEye(input, eyeBtn);

        setTimeout(() => input.focus(), 80);

        modal.querySelector('#vk-p2p-change-cancel').addEventListener('click', () => overlay.remove());

        async function apply() {
            const seed = input.value.trim();

            if (seed.length < 6) {
                error.textContent = 'Слишком коротко. Лучше минимум 12 символов или несколько слов.';
                error.style.display = 'block';
                return;
            }

            applyBtn.disabled = true;
            applyBtn.textContent = 'Создаю...';

            try {
                const keys = await deriveKeyMaterialFromSeed(seed);
                DERIVED_KEYS = keys;
                currentKeySlot = DEFAULT_KEY_SLOT;

                if (saveCheckbox.checked) {
                    saveDerivedKeys(keys);
                } else {
                    clearDerivedKeys();
                    DERIVED_KEYS = keys;
                }

                settings.saveDerivedKeys = Boolean(saveCheckbox.checked);
                saveSettings();

                overlay.remove();
                updateEncryptButtonsTitle();
                scan();

                showToast('✅ Seed-фраза сменена');
            } catch (err) {
                error.textContent = 'Ошибка: ' + err.message;
                error.style.display = 'block';
            } finally {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Сменить';
            }
        }

        applyBtn.addEventListener('click', apply);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                apply();
            }
        });
    }

