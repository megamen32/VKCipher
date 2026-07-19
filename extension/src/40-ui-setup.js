    // ============================================================
    // UI helpers
    // ============================================================

    function showToast(text) {
        injectStyles();

        const old = document.querySelector('.vk-p2p-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = 'vk-p2p-toast';
        toast.textContent = text;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function createModal({ title, bodyHtml, actionsHtml = '', closeOnOverlay = true }) {
        injectStyles();

        const overlay = document.createElement('div');
        overlay.className = 'vk-p2p-overlay';

        const modal = document.createElement('div');
        modal.className = 'vk-p2p-modal';

        modal.innerHTML = `
            <h3>${title}</h3>
            ${bodyHtml}
            ${actionsHtml ? `<div class="vk-p2p-actions">${actionsHtml}</div>` : ''}
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        if (closeOnOverlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });
        }

        return { overlay, modal };
    }

    function attachPasswordEye(input, eyeBtn) {
        eyeBtn.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
            eyeBtn.textContent = input.type === 'password' ? '👁️' : '🙈';
            input.focus();
        });
    }

    function closeMenus() {
        document.querySelectorAll('.vk-p2p-menu').forEach(el => el.remove());
    }

    function truncateForDisplay(s, max = 16) {
        if (!s) return '';
        if (s.length <= max) return s;
        return s.slice(0, max - 2) + '..';
    }

    function formatKeyDisplay(slotId) {
        if (slotId === '@temp') return '⚡ @temp — временный';
        if (['k1', 'k2', 'k3', 'k4'].includes(slotId)) return `🔑 ${slotId}`;

        const label = getCustomKeyLabel(slotId);
        if (!label) return `🔑 ${slotId}`;
        return `🔑 ${slotId} (${truncateForDisplay(label)})`;
    }

    // ============================================================
    // Setup modal
    // ============================================================

    function showSeedSetupModal() {
        if (document.querySelector('.vk-p2p-overlay')) return;

        const { overlay, modal } = createModal({
            title: '🔐 Настройка VKEncrypt',
            closeOnOverlay: true,
            bodyHtml: `
                <p>
                    Введите секретное слово, число или фразу. Из неё будут созданы одинаковые ключи
                    <b>k1–k4</b> на всех устройствах, где введена та же фраза.
                </p>

                <p class="vk-p2p-note">
                    Лучше использовать длинную фразу из нескольких слов. Простые числа вроде <b>1234</b>
                    легко перебираются. Фраза не сохраняется — сохраняются только производные ключи.
                </p>

                <div class="vk-p2p-row">
                    <input class="vk-p2p-input" id="vk-p2p-seed-input" type="password"
                        placeholder="Например: длинная секретная фраза">
                    <button class="vk-p2p-btn vk-p2p-btn-secondary vk-p2p-eye-btn" id="vk-p2p-seed-eye" type="button">👁️</button>
                </div>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-save-derived" type="checkbox" checked>
                    <span>Сохранить производные ключи на этом устройстве</span>
                </label>

                <label class="vk-p2p-check">
                    <input id="vk-p2p-auto-encrypt-first" type="checkbox">
                    <span>Включить автошифрование при отправке</span>
                </label>

                <label class="vk-p2p-check" for="vk-p2p-codec-first">
                    <span>Кодирование шифротекста</span>
                </label>
                <select class="vk-p2p-select" id="vk-p2p-codec-first">
                    <option value="emoji">Emoji</option>
                    <option value="cyrillic">Русский алфавит</option>
                    <option value="words">Русские слова (экспериментально)</option>
                    <option value="base64">Base64</option>
                </select>

                <p class="vk-p2p-error" id="vk-p2p-seed-error"></p>
            `,
            actionsHtml: `
                <button class="vk-p2p-btn vk-p2p-btn-secondary" id="vk-p2p-seed-temp">
                    Только на эту сессию
                </button>
                <button class="vk-p2p-btn vk-p2p-btn-primary" id="vk-p2p-seed-apply">
                    Создать ключи
                </button>
            `
        });

        const input = modal.querySelector('#vk-p2p-seed-input');
        const eyeBtn = modal.querySelector('#vk-p2p-seed-eye');
        const error = modal.querySelector('#vk-p2p-seed-error');
        const saveCheckbox = modal.querySelector('#vk-p2p-save-derived');
        const autoCheckbox = modal.querySelector('#vk-p2p-auto-encrypt-first');
        const codecSelect = modal.querySelector('#vk-p2p-codec-first');
        const applyBtn = modal.querySelector('#vk-p2p-seed-apply');
        const tempBtn = modal.querySelector('#vk-p2p-seed-temp');

        autoCheckbox.checked = settings.autoEncrypt;
        codecSelect.value = normalizeCodecId(settings.cipherCodec);

        attachPasswordEye(input, eyeBtn);

        setTimeout(() => input.focus(), 80);

        async function applySeed(saveMode) {
            const seed = input.value.trim();

            if (seed.length < 6) {
                error.textContent = 'Слишком коротко. Лучше минимум 12 символов или несколько слов.';
                error.style.display = 'block';
                return;
            }

            error.style.display = 'none';
            applyBtn.disabled = true;
            tempBtn.disabled = true;
            applyBtn.textContent = 'Создаю...';

            try {
                const keys = await deriveKeyMaterialFromSeed(seed);

                DERIVED_KEYS = keys;
                selectKeySlot(DEFAULT_KEY_SLOT, { rememberForChat: true });

                settings.autoEncrypt = Boolean(autoCheckbox.checked);
                settings.cipherCodec = normalizeCodecId(codecSelect.value);
                settings.saveDerivedKeys = Boolean(saveMode);
                saveSettings();

                if (saveMode) saveDerivedKeys(keys);

                overlay.remove();
                updateEncryptButtonsTitle();
                scan();

                showToast(saveMode ? '✅ Ключи созданы и сохранены' : '✅ Ключи созданы до перезагрузки страницы');
            } catch (err) {
                error.textContent = 'Ошибка генерации ключей: ' + err.message;
                error.style.display = 'block';
            } finally {
                applyBtn.disabled = false;
                tempBtn.disabled = false;
                applyBtn.textContent = 'Создать ключи';
            }
        }

        applyBtn.addEventListener('click', () => applySeed(saveCheckbox.checked));
        tempBtn.addEventListener('click', () => applySeed(false));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applySeed(saveCheckbox.checked);
            }
        });
    }
