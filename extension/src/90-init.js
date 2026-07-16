    // ============================================================
    // Scan loop
    // ============================================================

    function scan() {
        injectStyles();

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

    function init() {
        injectStyles();

        loadSettings();
        loadCustomKeys();

        DERIVED_KEYS = loadDerivedKeys();
        initProtectedVoiceRecorder();

        if (!DERIVED_KEYS && Object.keys(CUSTOM_KEYS).length) {
            currentKeySlot = Object.keys(CUSTOM_KEYS)[0];
        }

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
