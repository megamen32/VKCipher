    // ============================================================
    // Protected voice recording
    // ============================================================

    let activeVoiceRecording = null;
    let voiceRecorderClickInstalled = false;

    function getVoiceRecorderButton(target) {
        const button = target?.closest?.('button, [role="button"]');
        if (!button) return null;
        if (button.dataset.vkP2PVoiceButton === 'true') return button;

        const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''}`;
        if (/(голосов(ое|ого|ую)|аудиосообщени|начать запись)/i.test(label)) return button;

        const isMicButton = button.matches(
            '.ConvoComposer__sendButton--mic, [class*="sendButton--mic"], [class*="send-button--mic"]'
        );
        if (!isMicButton) return null;

        return getInputPlainText(getComposerInput()) ? null : button;
    }

    function getVoiceRecorderMimeType() {
        const candidates = RUNTIME_PLATFORM.isSafari
            ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
            : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

        if (typeof MediaRecorder?.isTypeSupported !== 'function') {
            return '';
        }

        return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    function getVoiceFileExtension(mimeType) {
        const mime = String(mimeType || '').toLowerCase();
        if (mime.includes('ogg')) return 'ogg';
        if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
        if (mime.includes('wav')) return 'wav';
        return 'webm';
    }

    function stopVoiceStream(stream) {
        stream?.getTracks?.().forEach(track => track.stop());
    }

    function findVoiceAttachmentInput(panel) {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
            .filter(input => !input.disabled && input.isConnected);
        if (!inputs.length) return null;

        const composerRoot = panel?.closest?.('.ConvoComposer, form, .im-compose, .im-chat-input') || panel;
        const score = input => {
            const accept = String(input.accept || '').toLowerCase();
            const hint = `${input.name || ''} ${input.id || ''} ${input.className || ''}`.toLowerCase();
            let value = 0;

            if (panel?.contains(input)) value += 20;
            if (composerRoot?.contains(input)) value += 10;
            if (!accept || accept.includes('*/*')) value += 8;
            if (accept.includes('application') || accept.includes('.vke')) value += 6;
            if (accept.includes('audio')) value += 3;
            if (/file|doc|attach|upload/.test(hint)) value += 4;
            if (accept.includes('image') && !accept.includes('audio') && !accept.includes('*')) value -= 8;

            return value;
        };

        return inputs.sort((left, right) => score(right) - score(left))[0] || null;
    }

    function attachEncryptedVoiceFile(panel, file) {
        const input = findVoiceAttachmentInput(panel);
        if (!input) {
            throw new Error('Не найден input вложений VK. Откройте меню «+» и повторите запись');
        }
        if (typeof DataTransfer !== 'function') {
            throw new Error('Платформа не поддерживает прикрепление записанного файла');
        }

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dataset.vkP2PMediaSynthetic = 'true';
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function createVoiceRecordingStatus(session) {
        const status = document.createElement('span');
        status.className = 'vk-p2p-voice-status';
        status.setAttribute('role', 'status');
        status.dataset.vkdecSkip = 'true';

        const reference = getDirectChildWithin(session.panel, session.button) || session.button;
        if (reference?.parentNode) {
            reference.parentNode.insertBefore(status, reference);
        } else {
            session.panel?.appendChild(status);
        }

        session.status = status;
        updateVoiceRecordingStatus(session);
    }

    function updateVoiceRecordingStatus(session) {
        if (!session.status) return;

        if (session.state === 'requesting') {
            session.status.textContent = 'Микрофон…';
            return;
        }
        if (session.state === 'encrypting') {
            session.status.textContent = 'Шифрую…';
            return;
        }

        const elapsed = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
        const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const seconds = String(elapsed % 60).padStart(2, '0');
        session.status.textContent = `● ${minutes}:${seconds}`;
    }

    function markVoiceButtonRecording(session) {
        const button = session.button;
        session.originalAriaLabel = button.getAttribute('aria-label');
        session.originalTitle = button.getAttribute('title');
        button.dataset.vkP2PVoiceButton = 'true';
        button.classList.add('vk-p2p-voice-recording');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Остановить и зашифровать голосовое сообщение');
        button.title = 'Остановить и прикрепить зашифрованную запись';
    }

    function restoreVoiceButton(session) {
        const button = session?.button;
        if (!button) return;

        button.classList.remove('vk-p2p-voice-recording');
        button.removeAttribute('aria-pressed');
        delete button.dataset.vkP2PVoiceButton;

        if (session.originalAriaLabel === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', session.originalAriaLabel);

        if (session.originalTitle === null) button.removeAttribute('title');
        else button.setAttribute('title', session.originalTitle);
    }

    function cleanupVoiceRecording(session) {
        if (!session) return;
        clearInterval(session.timer);
        stopVoiceStream(session.stream);
        session.status?.remove();
        restoreVoiceButton(session);
        if (activeVoiceRecording === session) activeVoiceRecording = null;
    }

    async function finishVoiceRecording(session) {
        if (session.finished) return;
        session.finished = true;

        if (session.cancelled) {
            cleanupVoiceRecording(session);
            return;
        }

        session.state = 'encrypting';
        updateVoiceRecordingStatus(session);

        try {
            const mimeType = session.recorder.mimeType || session.mimeType || 'audio/webm';
            const recording = new Blob(session.chunks, { type: mimeType });
            if (!recording.size) throw new Error('Запись получилась пустой');

            const extension = getVoiceFileExtension(mimeType);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sourceFile = new File(
                [recording],
                `voice-${timestamp}.${extension}`,
                { type: mimeType, lastModified: Date.now() }
            );
            const encryptedFile = await buildEncryptedMediaFile(
                sourceFile,
                session.keyHex,
                session.keySlot
            );

            attachEncryptedVoiceFile(session.panel, encryptedFile);
            showToast('✅ Голосовое зашифровано и прикреплено');
        } catch (err) {
            console.error('❌ Ошибка защищённой голосовой записи:', err);
            showToast(`❌ Не удалось прикрепить голосовое: ${err.message}`);
        } finally {
            cleanupVoiceRecording(session);
        }
    }

    async function startProtectedVoiceRecording(button) {
        if (!hasAnyKeys()) {
            showSeedSetupModal();
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function') {
            showToast(`❌ ${getPlatformDisplayName()} не поддерживает запись через MediaRecorder`);
            return;
        }

        const keyHex = getCurrentKeyHex();
        if (!keyHex) {
            showToast(`❌ Ключ "${currentKeySlot}" не найден`);
            return;
        }

        const input = getComposerInput();
        const panel = getComposerPanel(input) || button.closest('form') || button.parentElement;
        const session = {
            button,
            panel,
            keyHex,
            keySlot: currentKeySlot,
            chunks: [],
            state: 'requesting',
            startedAt: Date.now(),
            finished: false,
            cancelled: false,
            stream: null,
            recorder: null,
            status: null,
            timer: null,
        };
        activeVoiceRecording = session;
        markVoiceButtonRecording(session);
        createVoiceRecordingStatus(session);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (session.cancelled || activeVoiceRecording !== session) {
                stopVoiceStream(stream);
                return;
            }

            const mimeType = getVoiceRecorderMimeType();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            session.stream = stream;
            session.recorder = recorder;
            session.mimeType = mimeType;
            session.state = 'recording';
            session.startedAt = Date.now();

            recorder.addEventListener('dataavailable', event => {
                if (event.data?.size) session.chunks.push(event.data);
            });
            recorder.addEventListener('stop', () => finishVoiceRecording(session), { once: true });
            recorder.addEventListener('error', event => {
                const message = event.error?.message || 'MediaRecorder error';
                showToast(`❌ Ошибка записи: ${message}`);
                cleanupVoiceRecording(session);
            }, { once: true });
            recorder.start(250);
            session.timer = setInterval(() => updateVoiceRecordingStatus(session), 1000);
            updateVoiceRecordingStatus(session);
        } catch (err) {
            cleanupVoiceRecording(session);
            showToast(`❌ Не удалось начать запись: ${err.message}`);
        }
    }

    function stopProtectedVoiceRecording() {
        const session = activeVoiceRecording;
        if (!session) return;

        if (session.state === 'requesting') {
            session.cancelled = true;
            cleanupVoiceRecording(session);
            return;
        }
        if (session.state !== 'recording') return;

        session.state = 'encrypting';
        updateVoiceRecordingStatus(session);
        session.recorder.stop();
        stopVoiceStream(session.stream);
    }

    function cancelProtectedVoiceRecording() {
        const session = activeVoiceRecording;
        if (!session) return;

        session.cancelled = true;
        if (session.recorder?.state === 'recording') {
            session.recorder.onstop = null;
            session.recorder.stop();
        }
        cleanupVoiceRecording(session);
        showToast('⏸️ Голосовая запись отменена');
    }

    function handleProtectedVoiceClick(event) {
        const button = getVoiceRecorderButton(event.target);
        if (!button || !settings.encryptMediaUploads) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        if (activeVoiceRecording) {
            stopProtectedVoiceRecording();
            return;
        }

        startProtectedVoiceRecording(button);
    }

    function initProtectedVoiceRecorder() {
        if (voiceRecorderClickInstalled) return;
        voiceRecorderClickInstalled = true;
        document.addEventListener('click', handleProtectedVoiceClick, true);
    }

    function maintainProtectedVoiceRecorder() {
        if (activeVoiceRecording && !activeVoiceRecording.button.isConnected) {
            cancelProtectedVoiceRecording();
        }
    }
