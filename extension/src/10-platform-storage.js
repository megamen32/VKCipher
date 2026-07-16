    // ============================================================
    // Platform
    // ============================================================

    function detectRuntimePlatform() {
        const ua = navigator.userAgent || '';
        const vendor = navigator.vendor || '';
        const host = location.hostname.toLowerCase();
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const isSafari = /Safari\//.test(ua) &&
            !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua) &&
            /Apple/i.test(vendor || ua);
        const hasGMStorage = typeof GM_getValue === 'function' &&
            typeof GM_setValue === 'function' &&
            typeof GM_deleteValue === 'function';
        const hasGMNetwork = typeof GM_xmlhttpRequest === 'function';
        const siteFamily = host.endsWith('.vk.me') ? 'vk.me' : 'vk';

        return {
            ua,
            host,
            siteFamily,
            isIOS,
            isAndroid,
            isSafari,
            hasGMStorage,
            hasGMNetwork,
        };
    }

    function getPlatformDisplayName() {
        if (RUNTIME_PLATFORM.isSafari && RUNTIME_PLATFORM.isIOS) return 'Safari на iPhone/iPad';
        if (RUNTIME_PLATFORM.isSafari) return 'Safari';
        if (RUNTIME_PLATFORM.isAndroid) return 'Android';
        if (RUNTIME_PLATFORM.siteFamily === 'vk.me') return 'VK Me';
        return 'эта платформа';
    }

    function getCrossOriginMediaBlockReason(url) {
        if (!/^https?:/i.test(url || '')) return '';
        if (String(url).startsWith(location.origin)) return '';
        if (RUNTIME_PLATFORM.hasGMNetwork) return '';

        if (RUNTIME_PLATFORM.isSafari) {
            return `${getPlatformDisplayName()} не даёт расшифровать вложения на этом сайте`;
        }

        return 'Эта платформа не даёт расшифровать вложения на этом сайте';
    }

    function applyMediaPlatformBlock(box, reason) {
        if (!box) return;

        const meta = box.querySelector('.vk-p2p-media-meta');
        const error = box.querySelector('.vk-p2p-media-error');
        const decryptBtn = box.querySelector('.vk-p2p-media-btn');
        const downloadLink = box.querySelector('.vk-p2p-media-download');

        if (meta) {
            meta.textContent = reason;
        }
        if (error) {
            error.textContent = '';
        }
        if (downloadLink) {
            downloadLink.hidden = true;
            downloadLink.removeAttribute('href');
            downloadLink.removeAttribute('download');
        }
        if (decryptBtn) {
            decryptBtn.hidden = true;
            decryptBtn.disabled = false;
            decryptBtn.title = reason;
            decryptBtn.textContent = '🔓 Расшифровать вложение';
        }

        box.dataset.vkP2PPlatformBlocked = 'true';
    }

    // ============================================================
    // Storage
    // ============================================================

    function safeJsonParse(value, fallback) {
        try {
            if (!value) return fallback;
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function canUseLocalStorage() {
        try {
            const probeKey = `${STORAGE_FALLBACK_PREFIX}probe`;
            localStorage.setItem(probeKey, '1');
            localStorage.removeItem(probeKey);
            return true;
        } catch {
            return false;
        }
    }

    function gmGetValueCompat(key, fallback) {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, fallback);
        }

        if (!canUseLocalStorage()) {
            return fallback;
        }

        const value = localStorage.getItem(`${STORAGE_FALLBACK_PREFIX}${key}`);
        return value === null ? fallback : value;
    }

    function gmSetValueCompat(key, value) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }

        if (!canUseLocalStorage()) {
            return;
        }

        localStorage.setItem(`${STORAGE_FALLBACK_PREFIX}${key}`, value);
    }

    function gmDeleteValueCompat(key) {
        if (typeof GM_deleteValue === 'function') {
            GM_deleteValue(key);
            return;
        }

        if (!canUseLocalStorage()) {
            return;
        }

        localStorage.removeItem(`${STORAGE_FALLBACK_PREFIX}${key}`);
    }

    function gmGetJson(key, fallback) {
        return safeJsonParse(gmGetValueCompat(key, null), fallback);
    }

    function gmSetJson(key, value) {
        gmSetValueCompat(key, JSON.stringify(value));
    }

    function loadSettings() {
        const saved = gmGetJson(STORAGE_KEYS.SETTINGS, null);
        if (saved && typeof saved === 'object') {
            const normalized = { ...saved };

            if (typeof normalized.autoDecrypt !== 'boolean' && typeof normalized.decryptIncoming === 'boolean') {
                normalized.autoDecrypt = normalized.decryptIncoming;
            }

            if (!Object.prototype.hasOwnProperty.call(normalized, 'cipherCodec')) {
                normalized.cipherCodec = normalized.emojiCipher ? 'emoji' : 'base64';
            }

            settings = {
                ...settings,
                ...normalized
            };
        }
    }

    function saveSettings() {
        gmSetJson(STORAGE_KEYS.SETTINGS, {
            ...settings,
            decryptIncoming: settings.autoDecrypt,
            emojiCipher: settings.cipherCodec === 'emoji'
        });
    }

    function isValidKeyHex(hex) {
        return typeof hex === 'string' && /^[0-9a-f]{64}$/i.test(hex);
    }

    function areValidDerivedKeys(keys) {
        return Boolean(
            keys &&
            isValidKeyHex(keys.k1) &&
            isValidKeyHex(keys.k2) &&
            isValidKeyHex(keys.k3) &&
            isValidKeyHex(keys.k4)
        );
    }

    function normalizeKeyObject(obj) {
        const out = {};
        for (const [k, v] of Object.entries(obj || {})) {
            if (isValidKeyHex(v)) out[k] = String(v).toLowerCase();
        }
        return out;
    }

    function normalizeCustomKeyEntry(raw) {
        if (!raw) return null;

        if (typeof raw === 'string') {
            if (!isValidKeyHex(raw)) return null;
            return { key: raw.toLowerCase(), label: '' };
        }

        if (typeof raw === 'object') {
            if (!isValidKeyHex(raw.key)) return null;
            const label = typeof raw.label === 'string'
                ? raw.label.trim().slice(0, 64)
                : '';
            return { key: String(raw.key).toLowerCase(), label };
        }

        return null;
    }

    function loadDerivedKeys() {
        const saved = gmGetJson(STORAGE_KEYS.DERIVED_KEYS, null);
        if (areValidDerivedKeys(saved)) return normalizeKeyObject(saved);
        return null;
    }

    function saveDerivedKeys(keys) {
        if (!areValidDerivedKeys(keys)) return;
        gmSetJson(STORAGE_KEYS.DERIVED_KEYS, normalizeKeyObject(keys));
    }

    function clearDerivedKeys() {
        gmDeleteValueCompat(STORAGE_KEYS.DERIVED_KEYS);
        DERIVED_KEYS = null;
    }

    function loadCustomKeys() {
        const saved = gmGetJson(STORAGE_KEYS.CUSTOM_KEYS, {});
        const out = {};
        for (const [slot, raw] of Object.entries(saved || {})) {
            const normalized = normalizeCustomKeyEntry(raw);
            if (normalized) out[slot] = normalized;
        }
        CUSTOM_KEYS = out;
    }

    function saveCustomKeys() {
        gmSetJson(STORAGE_KEYS.CUSTOM_KEYS, CUSTOM_KEYS);
    }

    function resetAllKeys() {
        clearDerivedKeys();
        gmDeleteValueCompat(STORAGE_KEYS.CUSTOM_KEYS);
        CUSTOM_KEYS = {};
        TEMP_KEY = null;
        currentKeySlot = DEFAULT_KEY_SLOT;
        updateEncryptButtonsTitle();
        showSeedSetupModal();
    }

