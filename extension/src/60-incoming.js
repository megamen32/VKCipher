    // ============================================================
    // Incoming decrypt
    // ============================================================

    function createToggleInterface(originalEnc, decryptedText, parentEl) {
        parentEl.innerHTML = '';
        parentEl.dataset.vkdecOriginal = originalEnc;

        const textSpan = document.createElement('span');
        textSpan.className = 'vk-dec-content';
        textSpan.dataset.vkdecSkip = 'true';
        textSpan.textContent = decryptedText;
        textSpan.style.fontWeight = 'normal';

        const toggleLink = document.createElement('a');
        toggleLink.href = '#';
        toggleLink.className = 'vk-dec-toggle';
        toggleLink.dataset.vkdecSkip = 'true';
        toggleLink.textContent = '[шифр]';
        toggleLink.title = 'Показать зашифрованный оригинал';

        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (toggleLink.textContent === '[шифр]') {
                textSpan.textContent = originalEnc;
                textSpan.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
                toggleLink.textContent = '[текст]';
            } else {
                textSpan.textContent = decryptedText;
                textSpan.style.fontFamily = '';
                toggleLink.textContent = '[шифр]';
            }
        });

        parentEl.appendChild(textSpan);
        parentEl.appendChild(document.createTextNode(' '));
        parentEl.appendChild(toggleLink);

        parentEl.dataset.vkdecDone = 'true';
    }

    function createErrorInterface(originalEnc, errorText, parentEl) {
        parentEl.innerHTML = '';
        parentEl.dataset.vkdecOriginal = originalEnc;

        const rawSpan = document.createElement('span');
        rawSpan.className = 'vk-dec-content';
        rawSpan.dataset.vkdecSkip = 'true';
        rawSpan.textContent = originalEnc;

        const errorLine = document.createElement('span');
        errorLine.className = 'vk-dec-error';
        errorLine.dataset.vkdecSkip = 'true';
        errorLine.textContent = `ошибка: ${errorText}`;

        parentEl.appendChild(rawSpan);
        parentEl.appendChild(errorLine);
        parentEl.dataset.vkdecDone = 'true';
    }

    function formatByteSize(size) {
        const value = Number(size) || 0;
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    function getMediaLinkName(link) {
        if (!link) return '';

        const headline = link.querySelector('.AttachmentCell__headline, h4');
        if (headline?.textContent) {
            return headline.textContent.trim();
        }

        return (link.textContent || '').trim();
    }

    function setMediaLinkName(link, name) {
        if (!link) return;

        const headline = link.querySelector('.AttachmentCell__headline, h4');
        if (headline) {
            headline.textContent = name;
            return;
        }

        link.textContent = name;
    }

    function setMediaLinkFootnote(link, metadata, sizeBytes) {
        if (!link) return;

        const footnote = link.querySelector('.AttachmentCell__footnote');
        if (!footnote) return;

        const ext = (String(metadata?.originalName || '').split('.').pop() || 'BIN').toUpperCase();
        footnote.textContent = `${ext} ᐧ ${formatByteSize(sizeBytes)}`;
    }

    function isEncryptedMediaLink(link) {
        const name = getMediaLinkName(link);
        const href = link.getAttribute('href') || '';
        const footnote = (link.querySelector('.AttachmentCell__footnote')?.textContent || '').trim();

        return (
            /\.vke$/i.test(name) ||
            /\.vke($|[?#])/i.test(href) ||
            (/\.vke/i.test(name) && /\bVKE\b/i.test(footnote))
        );
    }

    function getEncryptedMediaLinks() {
        const links = new Set();

        document.querySelectorAll('a[href]').forEach(link => {
            if (link.closest('.vk-p2p-media-box')) return;
            if (link.dataset.vkP2PMediaLink === 'true') {
                links.add(link);
                return;
            }

            if (!isEncryptedMediaLink(link)) return;

            const container = link.closest(
                'article, .ConvoMessage, .ConvoMessage__text, .MessageText, .im_msg_text, .im-message--text, [role="listitem"], .Attachments'
            );
            if (!container) return;

            links.add(link);
        });

        return links;
    }

    function ensureMediaInterface(link) {
        if (link.dataset.vkP2PMediaLink === 'true') {
            const existing = link.parentElement?.querySelector('.vk-p2p-media-box');
            if (existing) return existing;
        }

        if (!link.dataset.vkP2POriginalHref) {
            link.dataset.vkP2POriginalHref = link.getAttribute('href') || '';
            link.dataset.vkP2POriginalText = getMediaLinkName(link);
            link.dataset.vkP2POriginalFootnote = (link.querySelector('.AttachmentCell__footnote')?.textContent || '').trim();
        }

        const box = document.createElement('div');
        box.className = 'vk-p2p-media-box';
        box.dataset.vkdecSkip = 'true';

        const actions = document.createElement('div');
        actions.className = 'vk-p2p-media-actions';

        const decryptBtn = document.createElement('button');
        decryptBtn.type = 'button';
        decryptBtn.className = 'vk-p2p-media-btn';
        decryptBtn.textContent = '🔓 Расшифровать вложение';

        const downloadLink = document.createElement('a');
        downloadLink.className = 'vk-p2p-media-download';
        downloadLink.textContent = 'Скачать';
        downloadLink.hidden = true;
        downloadLink.target = '_blank';
        downloadLink.rel = 'noopener noreferrer';

        const meta = document.createElement('div');
        meta.className = 'vk-p2p-media-meta';
        meta.textContent = 'Зашифрованное вложение VKEncrypt';

        const preview = document.createElement('div');
        preview.className = 'vk-p2p-media-preview';

        const error = document.createElement('div');
        error.className = 'vk-p2p-media-error';

        actions.appendChild(decryptBtn);
        actions.appendChild(downloadLink);
        box.appendChild(actions);
        box.appendChild(meta);
        box.appendChild(preview);
        box.appendChild(error);

        decryptBtn.addEventListener('click', () => {
            decryptIncomingMediaLink(link, { manual: true });
        });

        link.insertAdjacentElement('afterend', box);
        link.dataset.vkP2PMediaLink = 'true';
        return box;
    }

    function restoreMediaLink(link) {
        if (!link) return;

        const originalHref = link.dataset.vkP2POriginalHref;
        const originalText = link.dataset.vkP2POriginalText;
        const originalFootnote = link.dataset.vkP2POriginalFootnote;

        if (typeof originalHref === 'string') {
            link.setAttribute('href', originalHref);
        }

        if (typeof originalText === 'string') {
            setMediaLinkName(link, originalText);
        }

        const footnote = link.querySelector('.AttachmentCell__footnote');
        if (footnote && typeof originalFootnote === 'string') {
            footnote.textContent = originalFootnote;
        }

        link.removeAttribute('download');
    }

    function getMediaCacheKey(link) {
        return link?.dataset?.vkP2POriginalHref || link?.getAttribute('href') || '';
    }

    function getCachedDecryptedMedia(link) {
        const key = getMediaCacheKey(link);
        return key ? MEDIA_DECRYPT_CACHE.get(key) || null : null;
    }

    function setCachedDecryptedMedia(link, value) {
        const key = getMediaCacheKey(link);
        if (!key) return;
        MEDIA_DECRYPT_CACHE.set(key, value);
    }

    function resetMediaInterface(box, options = {}) {
        if (!box) return;
        const { preserveAutoTried = false } = options;

        const link = box.previousElementSibling?.matches?.('a[href]')
            ? box.previousElementSibling
            : null;

        const preview = box.querySelector('.vk-p2p-media-preview');
        const error = box.querySelector('.vk-p2p-media-error');
        const downloadLink = box.querySelector('.vk-p2p-media-download');
        const decryptBtn = box.querySelector('.vk-p2p-media-btn');
        const meta = box.querySelector('.vk-p2p-media-meta');

        if (preview?.dataset.vkP2PObjectUrl) {
            delete preview.dataset.vkP2PObjectUrl;
        }

        if (preview) preview.innerHTML = '';
        if (error) error.textContent = '';
        if (downloadLink) {
            downloadLink.hidden = true;
            downloadLink.removeAttribute('href');
            downloadLink.removeAttribute('download');
        }
        if (decryptBtn) {
            decryptBtn.disabled = false;
            decryptBtn.hidden = false;
            decryptBtn.textContent = '🔓 Расшифровать вложение';
            decryptBtn.removeAttribute('title');
        }
        if (meta) {
            meta.textContent = 'Зашифрованное вложение VKEncrypt';
        }

        restoreMediaLink(link);

        delete box.dataset.vkP2PDecoded;
        delete box.dataset.vkP2PPlatformBlocked;
        if (!preserveAutoTried) {
            delete box.dataset.vkP2PAutoTried;
        }
    }

    function restoreAllIncomingMedia() {
        document.querySelectorAll('.vk-p2p-media-box').forEach(box => resetMediaInterface(box));
    }

    async function fetchEncryptedMediaBytes(link) {
        const url = link.href;

        if (typeof GM_xmlhttpRequest === 'function' && /^https?:/i.test(url) && !url.startsWith(location.origin)) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300 && response.response) {
                            resolve(new Uint8Array(response.response));
                            return;
                        }

                        reject(new Error(`HTTP ${response.status}`));
                    },
                    onerror: () => {
                        reject(new Error('GM_xmlhttpRequest failed'));
                    }
                });
            });
        }

        const platformBlockReason = getCrossOriginMediaBlockReason(url);
        if (platformBlockReason) {
            throw new Error(platformBlockReason);
        }

        const response = await fetch(url, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return new Uint8Array(await response.arrayBuffer());
    }

    function renderDecryptedMedia(box, metadata, bytes, cachedObjectUrl = '') {
        const link = box.previousElementSibling?.matches?.('a[href]')
            ? box.previousElementSibling
            : null;
        const preview = box.querySelector('.vk-p2p-media-preview');
        const meta = box.querySelector('.vk-p2p-media-meta');
        const downloadLink = box.querySelector('.vk-p2p-media-download');
        const decryptBtn = box.querySelector('.vk-p2p-media-btn');
        const blob = new Blob([bytes], {
            type: metadata.mime || 'application/octet-stream'
        });
        const objectUrl = cachedObjectUrl || URL.createObjectURL(blob);

        if (preview?.dataset.vkP2PObjectUrl) {
            URL.revokeObjectURL(preview.dataset.vkP2PObjectUrl);
        }

        preview.innerHTML = '';
        preview.dataset.vkP2PObjectUrl = objectUrl;

        if (/^image\//i.test(metadata.mime || '')) {
            const img = document.createElement('img');
            img.src = objectUrl;
            img.alt = metadata.originalName || 'encrypted image';
            preview.appendChild(img);
        } else if (/^audio\//i.test(metadata.mime || '')) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = objectUrl;
            preview.appendChild(audio);
        } else if (/^video\//i.test(metadata.mime || '')) {
            const video = document.createElement('video');
            video.controls = true;
            video.src = objectUrl;
            preview.appendChild(video);
        }

        if (meta) {
            meta.textContent = `${metadata.originalName || 'media'} • ${formatByteSize(metadata.originalSize || bytes.length)}`;
        }

        if (downloadLink) {
            downloadLink.href = objectUrl;
            downloadLink.download = metadata.originalName || 'media.bin';
            downloadLink.hidden = false;
        }

        if (link) {
            link.href = objectUrl;
            link.download = metadata.originalName || 'media.bin';
            setMediaLinkName(link, metadata.originalName || 'media.bin');
            setMediaLinkFootnote(link, metadata, metadata.originalSize || bytes.length);
        }

        if (decryptBtn) {
            decryptBtn.disabled = false;
            decryptBtn.hidden = true;
        }

        box.dataset.vkP2PDecoded = 'true';
    }

    async function decryptIncomingMediaLink(link, { manual = false } = {}) {
        const box = ensureMediaInterface(link);
        const decryptBtn = box.querySelector('.vk-p2p-media-btn');
        const error = box.querySelector('.vk-p2p-media-error');

        if (!hasAnyKeys()) {
            if (manual) showSeedSetupModal();
            return;
        }

        if (decryptBtn) {
            decryptBtn.disabled = true;
            decryptBtn.textContent = 'Расшифровываю...';
        }
        if (error) error.textContent = '';

        const platformBlockReason = getCrossOriginMediaBlockReason(link.href);
        if (platformBlockReason) {
            resetMediaInterface(box, { preserveAutoTried: !manual });
            applyMediaPlatformBlock(box, platformBlockReason);
            if (manual) {
                showToast(`⚠️ ${platformBlockReason}`);
            }
            return;
        }

        try {
            const cached = getCachedDecryptedMedia(link);
            if (cached) {
                renderDecryptedMedia(box, cached.metadata || {}, cached.bytes, cached.objectUrl || '');
            } else {
                const containerBytes = await fetchEncryptedMediaBytes(link);
                const parsed = parseEncryptedMediaContainer(containerBytes);
                const slotId = parsed.metadata?.keyId || currentKeySlot;
                const keyHex = getAllKeys()[slotId];

                if (!keyHex) {
                    throw new Error(`Ключ "${slotId}" не найден`);
                }

                const bytes = await decryptBinaryAESGCM(parsed.encryptedPayload, keyHex);
                const objectUrl = URL.createObjectURL(new Blob([bytes], {
                    type: parsed.metadata?.mime || 'application/octet-stream'
                }));

                setCachedDecryptedMedia(link, {
                    metadata: parsed.metadata || {},
                    bytes,
                    objectUrl
                });
                renderDecryptedMedia(box, parsed.metadata || {}, bytes, objectUrl);
            }
        } catch (err) {
            resetMediaInterface(box, { preserveAutoTried: !manual });
            if (error) {
                error.textContent = `ошибка: ${err.message}`;
            }
            if (manual) {
                showToast(`❌ Не удалось расшифровать вложение: ${err.message}`);
            }
        } finally {
            if (decryptBtn && box.dataset.vkP2PDecoded !== 'true') {
                decryptBtn.disabled = false;
            }
        }
    }

    function decorateIncomingMediaLinks() {
        getEncryptedMediaLinks().forEach(link => {
            const box = ensureMediaInterface(link);

            if (!settings.autoDecrypt) {
                if (!box.dataset.vkP2PDecoded) {
                    const btn = box.querySelector('.vk-p2p-media-btn');
                    if (btn) {
                        btn.hidden = false;
                        btn.textContent = '🔓 Расшифровать вложение';
                    }
                }
                return;
            }

            if (box.dataset.vkP2PAutoTried === 'true') return;
            observeMediaPreview(link, box);
        });
    }

    function observeMediaPreview(link, box) {
        if (!mediaPreviewObserver) {
            mediaPreviewObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;

                    const targetBox = entry.target;
                    mediaPreviewObserver.unobserve(targetBox);

                    if (targetBox.dataset.vkP2PAutoTried === 'true') return;
                    targetBox.dataset.vkP2PAutoTried = 'true';

                    const targetLink = targetBox.previousElementSibling?.matches?.('a[href]')
                        ? targetBox.previousElementSibling
                        : null;
                    if (!targetLink) return;

                    decryptIncomingMediaLink(targetLink, { manual: false });
                });
            }, {
                root: null,
                rootMargin: '120px 0px',
                threshold: 0.01
            });
        }

        mediaPreviewObserver.observe(box);
    }

    function restoreIncomingMessage(msgEl) {
        const originalEnc = msgEl.dataset.vkdecOriginal;
        if (!originalEnc) return;

        msgEl.innerHTML = '';
        msgEl.textContent = originalEnc;
        delete msgEl.dataset.vkdecDone;
    }

    function restoreAllIncomingMessages() {
        document.querySelectorAll('[data-vkdec-original]').forEach(el => restoreIncomingMessage(el));
    }

    function extractNodeText(node) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const el = /** @type {HTMLElement} */ (node);

        if (el.dataset?.vkdecSkip === 'true') {
            return '';
        }

        if (el.tagName === 'IMG') {
            return el.getAttribute('alt') || '';
        }

        let out = '';
        el.childNodes.forEach(child => {
            out += extractNodeText(child);
        });
        return out;
    }

    function extractMessageText(msgEl) {
        return extractNodeText(msgEl).trim();
    }

    async function processIncomingMessage(msgEl) {
        if (!settings.autoDecrypt) return;
        if (!hasAnyKeys()) return;
        if (msgEl.dataset.vkdecDone) return;

        const text = extractMessageText(msgEl);
        const parsed = parseEncryptedMessage(text);
        if (!parsed) return;

        const keyHex = getAllKeys()[parsed.keyId];

        if (!keyHex) {
            console.warn(`🔑 Ключ "${parsed.keyId}" не найден`);
            return;
        }

        try {
            const payload = decodePayloadForCodec(parsed.encodedPayload, parsed.codecId);
            const decrypted = await decryptAESGCM(payload, keyHex);
            createToggleInterface(parsed.originalText, decrypted, msgEl);
        } catch (err) {
            console.error('❌ Ошибка расшифровки:', err);
            createErrorInterface(parsed.originalText, err.message, msgEl);
        }
    }

    function getIncomingMessageElements() {
        const elements = new Set();

        document.querySelectorAll(
            '.ConvoMessage__text, .MessageText, .im_msg_text, .im-message--text'
        ).forEach(el => {
            if (el.closest('[data-vkdec-done="true"]')) return;
            elements.add(el);
        });

        document.querySelectorAll('[role="list"][aria-label*="Сообщения"]').forEach(list => {
            list.querySelectorAll('article span, article div').forEach(el => {
                if (el.dataset.vkdecSkip === 'true') return;
                if (el.closest('[data-vkdec-done="true"]')) return;
                if (el.children.length) return;

                const text = extractMessageText(el);
                if (parseEncryptedMessage(text)) {
                    elements.add(el);
                }
            });
        });

        return elements;
    }

