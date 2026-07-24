    // ============================================================
    // Scan loop
    // ============================================================

    function scan() {
        injectStyles();
        applyRememberedKeyForCurrentChat();

        getIncomingMessageElements().forEach(el => processIncomingMessage(el));
        decorateIncomingMediaLinks();

        addEncryptButton();
        maintainProtectedVoiceRecorder();
    }

    function scheduleScan(delay = 250) {
        if (scanTimer !== null) return;

        scanTimer = setTimeout(() => {
            scanTimer = null;
            scan();
        }, delay);
    }

    function isVkHost(hostname = location.hostname) {
        if (window.__VKENC_TEST_FORCE_VK === true) return true;

        const host = String(hostname || '').toLowerCase();
        return host === 'vk.com' || host.endsWith('.vk.com') ||
            host === 'vk.ru' || host.endsWith('.vk.ru') ||
            host === 'web.vk.me' || host === 'm.web.vk.me';
    }

    function init() {
        loadSettings();
        loadCustomKeys();
        loadChatKeySlots();

        DERIVED_KEYS = loadDerivedKeys();

        if (!DERIVED_KEYS && Object.keys(CUSTOM_KEYS).length) {
            currentKeySlot = Object.keys(CUSTOM_KEYS)[0];
        }

        // Keep the legacy VK DOM scanner out of other messenger adapters,
        // while still making the shared keyring/settings available to them.
        // about:blank remains enabled for the browser integration fixtures.
        if (location.hostname && !isVkHost()) return;

        injectStyles();
        initProtectedVoiceRecorder();

        applyRememberedKeyForCurrentChat({ force: true });
        initChatKeyNavigation();

        console.log(`🔐 ${APP_NAME} v${APP_VERSION} loaded`);
        console.log('🔑 Derived keys:', DERIVED_KEYS ? 'yes' : 'no');
        console.log('🔑 Custom keys:', Object.keys(CUSTOM_KEYS).join(', ') || 'none');
        console.log('⚡ Temp key:', TEMP_KEY ? 'yes' : 'no');

        scheduleScan(700);

        const observer = new MutationObserver(() => {
            scheduleScan();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        document.addEventListener('change', (e) => {
            handleMediaFileInputChange(e);
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMenus();
                cancelProtectedVoiceRecording();
            }
        }, true);
    }

    init();

})();
