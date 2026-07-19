    // ============================================================
    // Per-chat key selection
    // ============================================================

    function normalizeChatKeySlots(value) {
        const normalized = {};

        for (const [chatId, slotId] of Object.entries(value || {})) {
            if (!/^vk:(peer|chat):[^\s]{1,96}$/.test(chatId)) continue;
            if (typeof slotId !== 'string' || !slotId || slotId.length > 64) continue;
            normalized[chatId] = slotId;
        }

        return normalized;
    }

    function loadChatKeySlots() {
        CHAT_KEY_SLOTS = normalizeChatKeySlots(
            gmGetJson(STORAGE_KEYS.CHAT_KEY_SLOTS, {})
        );
    }

    function saveChatKeySlots() {
        gmSetJson(STORAGE_KEYS.CHAT_KEY_SLOTS, CHAT_KEY_SLOTS);
    }

    function normalizeChatPeerId(rawValue) {
        let value;
        try {
            value = decodeURIComponent(String(rawValue || ''));
        } catch {
            return '';
        }

        value = value.trim().replace(/^peer:/i, '');
        if (!value || value.length > 96) return '';

        if (/^c\d+$/i.test(value)) {
            return `vk:chat:${value.toLowerCase()}`;
        }
        if (/^-?\d+$/.test(value)) {
            return `vk:peer:${value}`;
        }
        if (/^[a-z0-9_.-]+$/i.test(value)) {
            return `vk:peer:${value.toLowerCase()}`;
        }

        return '';
    }

    function getCurrentChatId(urlValue = location.href) {
        let url;
        try {
            url = new URL(urlValue, location.origin);
        } catch {
            return '';
        }

        const queryPeer = ['sel', 'peer', 'peer_id', 'chat', 'convo']
            .map(name => url.searchParams.get(name))
            .find(Boolean);
        if (queryPeer) return normalizeChatPeerId(queryPeer);

        const pathMatch = /\/(?:mail\/)?convo\/([^/?#]+)/i.exec(url.pathname) ||
            /\/im\/(?:convo\/)?([^/?#]+)/i.exec(url.pathname);
        return pathMatch ? normalizeChatPeerId(pathMatch[1]) : '';
    }

    function getFallbackKeySlot() {
        const allKeys = getAllKeys();
        if (allKeys[DEFAULT_KEY_SLOT]) return DEFAULT_KEY_SLOT;
        return Object.keys(allKeys)[0] || DEFAULT_KEY_SLOT;
    }

    function rememberKeyForCurrentChat(slotId) {
        const chatId = getCurrentChatId();
        if (!chatId) return false;

        CHAT_KEY_SLOTS[chatId] = slotId;
        currentChatContextId = chatId;
        saveChatKeySlots();
        return true;
    }

    function selectKeySlot(slotId, { rememberForChat = true } = {}) {
        if (!getAllKeys()[slotId]) return false;

        currentKeySlot = slotId;
        if (rememberForChat) rememberKeyForCurrentChat(slotId);
        updateEncryptButtonsTitle();
        return true;
    }

    function applyRememberedKeyForCurrentChat({ force = false } = {}) {
        const chatId = getCurrentChatId();
        if (!chatId) return false;
        if (!force && currentChatContextId === chatId) return false;

        currentChatContextId = chatId;
        const allKeys = getAllKeys();
        const rememberedSlot = CHAT_KEY_SLOTS[chatId];
        let nextSlot = rememberedSlot;

        if (!nextSlot || !allKeys[nextSlot]) {
            nextSlot = getFallbackKeySlot();
            if (rememberedSlot) {
                delete CHAT_KEY_SLOTS[chatId];
                saveChatKeySlots();
            }
        }

        if (currentKeySlot === nextSlot) return false;
        currentKeySlot = nextSlot;
        updateEncryptButtonsTitle();
        return true;
    }

    function forgetChatKeySlot(slotId) {
        let changed = false;

        for (const [chatId, savedSlot] of Object.entries(CHAT_KEY_SLOTS)) {
            if (savedSlot !== slotId) continue;
            delete CHAT_KEY_SLOTS[chatId];
            changed = true;
        }

        if (changed) saveChatKeySlots();
    }

    function clearChatKeySlots() {
        CHAT_KEY_SLOTS = {};
        currentChatContextId = '';
        gmDeleteValueCompat(STORAGE_KEYS.CHAT_KEY_SLOTS);
    }

    function initChatKeyNavigation() {
        if (history.pushState?.vkP2PWrapped) return;

        const refresh = () => {
            currentChatContextId = '';
            applyRememberedKeyForCurrentChat({ force: true });
            scheduleScan();
        };

        ['pushState', 'replaceState'].forEach(methodName => {
            const original = history[methodName];
            if (typeof original !== 'function') return;

            const wrapped = function (...args) {
                const result = original.apply(this, args);
                refresh();
                return result;
            };
            wrapped.vkP2PWrapped = true;
            history[methodName] = wrapped;
        });

        window.addEventListener('popstate', refresh);
    }
