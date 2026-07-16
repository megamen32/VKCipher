    // ============================================================
    // Styles
    // ============================================================

    function injectStyles() {
        if (document.getElementById('vk-p2p-styles')) return;

        const style = document.createElement('style');
        style.id = 'vk-p2p-styles';
        style.textContent = `
            @keyframes vkP2PFadeIn {
                from { opacity: 0; transform: translateY(8px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes vkP2PToastOut {
                0% { opacity: 1; transform: translate(-50%, 0); }
                75% { opacity: 1; transform: translate(-50%, 0); }
                100% { opacity: 0; transform: translate(-50%, 12px); }
            }

            .vk-p2p-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.62);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
                backdrop-filter: blur(4px);
            }

            .vk-p2p-modal {
                width: min(480px, 100%);
                max-height: calc(100vh - 32px);
                overflow-y: auto;
                background: #ffffff;
                color: #111827;
                border-radius: 18px;
                box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
                padding: 20px;
                box-sizing: border-box;
                animation: vkP2PFadeIn 0.18s ease-out;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            }

            .vk-p2p-modal h3 {
                margin: 0 0 8px;
                font-size: 18px;
                line-height: 1.25;
                font-weight: 700;
            }

            .vk-p2p-modal p {
                margin: 0 0 12px;
                font-size: 13px;
                line-height: 1.45;
                color: #4b5563;
            }

            .vk-p2p-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .vk-p2p-input,
            .vk-p2p-select,
            .vk-p2p-textarea {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #d1d5db;
                background: #fff;
                color: #111827;
                border-radius: 10px;
                padding: 11px 12px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.15s, box-shadow 0.15s;
            }

            .vk-p2p-input:focus,
            .vk-p2p-select:focus,
            .vk-p2p-textarea:focus {
                border-color: #2688eb;
                box-shadow: 0 0 0 3px rgba(38, 136, 235, 0.15);
            }

            .vk-p2p-textarea {
                min-height: 84px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }

            .vk-p2p-check {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                font-size: 13px;
                line-height: 1.35;
                color: #374151;
                margin: 8px 0 12px;
                user-select: none;
            }

            .vk-p2p-check input {
                margin-top: 2px;
            }

            .vk-p2p-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 14px;
                flex-wrap: wrap;
            }

            .vk-p2p-btn {
                border: none;
                border-radius: 10px;
                padding: 9px 13px;
                font-size: 13px;
                cursor: pointer;
                transition: transform 0.08s, opacity 0.15s, background 0.15s;
                white-space: nowrap;
            }

            .vk-p2p-btn:active {
                transform: translateY(1px);
            }

            .vk-p2p-btn:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .vk-p2p-btn-primary {
                background: #2688eb;
                color: #fff;
            }

            .vk-p2p-btn-secondary {
                background: #f3f4f6;
                color: #111827;
            }

            .vk-p2p-btn-danger {
                background: #fee2e2;
                color: #991b1b;
            }

            .vk-p2p-eye-btn {
                min-width: 44px;
                padding-left: 10px;
                padding-right: 10px;
            }

            .vk-p2p-error {
                display: none;
                color: #b91c1c !important;
                font-size: 12px !important;
                margin-top: 8px !important;
            }

            .vk-p2p-note {
                border-radius: 12px;
                padding: 10px 12px;
                background: #f3f7ff;
                color: #31527a !important;
                font-size: 12px !important;
            }

            .vk-p2p-controls {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 2px;
                margin-right: 2px;
                align-self: flex-end;
                min-width: 36px;
                min-height: 36px;
                vertical-align: middle;
            }

            .vk-p2p-icon-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                background: transparent;
                border: none;
                cursor: pointer;
                color: inherit;
                opacity: 0.58;
                padding: 0;
                border-radius: 8px;
                line-height: 1;
                transition: opacity 0.15s, background 0.15s;
                vertical-align: middle;
            }

            .vk-p2p-icon-glyph {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                line-height: 1;
                transform: translateY(-1px);
                pointer-events: none;
            }

            .vk-p2p-icon-btn:hover {
                opacity: 1;
                background: rgba(127, 127, 127, 0.10);
            }

            .vk-p2p-icon-btn-main {
                font-size: 18px;
            }

            .vk-p2p-icon-btn-small {
                font-size: 18px;
            }

            .vk-p2p-menu {
                position: fixed;
                z-index: 999999;
                box-sizing: border-box;
                width: min(340px, calc(100vw - 16px));
                max-width: calc(100vw - 16px);
                max-height: calc(100vh - 16px);
                overflow-y: auto;
                padding: 8px;
                border-radius: 14px;
                background: #ffffff;
                color: #111827;
                box-shadow: 0 18px 48px rgba(0,0,0,0.24);
                border: 1px solid rgba(0,0,0,0.10);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                font-size: 13px;
                animation: vkP2PFadeIn 0.12s ease-out;
            }

            .vk-p2p-menu-title {
                padding: 7px 9px 6px;
                color: #6b7280;
                font-size: 12px;
            }

            .vk-p2p-menu-item {
                display: block;
                width: 100%;
                border: none;
                background: transparent;
                color: inherit;
                text-align: left;
                padding: 9px 10px;
                border-radius: 9px;
                cursor: pointer;
                font: inherit;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 100%;
            }

            .vk-p2p-menu-field {
                display: grid;
                gap: 6px;
                padding: 8px 10px;
            }

            .vk-p2p-menu-label {
                color: #4b5563;
                font-size: 12px;
            }

            .vk-p2p-menu-select {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #d1d5db;
                border-radius: 9px;
                padding: 8px 10px;
                background: #fff;
                color: #111827;
                font: inherit;
            }

            .vk-p2p-menu-item:hover {
                background: #f3f4f6;
            }

            .vk-p2p-menu-item-active {
                background: #e8f1ff;
                color: #155aa3;
            }

            .vk-p2p-menu-sep {
                border-top: 1px solid #eef0f3;
                margin: 6px 0;
            }

            .vk-p2p-menu-danger {
                color: #b91c1c;
            }

            .vk-p2p-toast {
                position: fixed;
                left: 50%;
                bottom: 22px;
                transform: translateX(-50%);
                background: #1f2937;
                color: #fff;
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 13px;
                z-index: 1000000;
                box-shadow: 0 8px 28px rgba(0,0,0,0.25);
                animation: vkP2PToastOut 2.4s forwards;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            }

            .vk-p2p-voice-status {
                display: inline-flex;
                align-items: center;
                min-width: 62px;
                height: 28px;
                padding: 0 9px;
                border-radius: 14px;
                background: rgba(213, 53, 67, 0.14);
                color: #d53543;
                font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
                white-space: nowrap;
            }

            .vk-p2p-voice-recording {
                color: #d53543 !important;
                animation: vk-p2p-voice-pulse 1.2s ease-in-out infinite;
            }

            @keyframes vk-p2p-voice-pulse {
                50% { opacity: 0.45; }
            }

            .vk-dec-content {
                white-space: pre-wrap;
            }

            .vk-dec-toggle {
                display: inline-block;
                margin-left: 8px;
                font-size: 11px;
                text-decoration: underline;
                cursor: pointer;
                opacity: 0.65;
                user-select: none;
                color: inherit;
            }

            .vk-dec-toggle:hover {
                opacity: 1;
            }

            .vk-dec-error {
                display: block;
                margin-top: 6px;
                font-size: 12px;
                line-height: 1.35;
                color: rgba(255, 255, 255, 0.72);
            }

            .vk-p2p-media-box {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 8px;
                padding: 10px 12px;
                border-radius: 12px;
                background: rgba(38, 136, 235, 0.10);
                max-width: min(520px, 100%);
            }

            .vk-p2p-media-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .vk-p2p-media-btn,
            .vk-p2p-media-download {
                border: none;
                border-radius: 999px;
                padding: 6px 10px;
                font-size: 12px;
                line-height: 1.2;
                cursor: pointer;
                background: rgba(38, 136, 235, 0.18);
                color: inherit;
                text-decoration: none;
            }

            .vk-p2p-media-download[hidden] {
                display: none !important;
            }

            .vk-p2p-media-meta {
                font-size: 12px;
                opacity: 0.72;
                word-break: break-word;
            }

            .vk-p2p-media-preview img,
            .vk-p2p-media-preview video {
                display: block;
                max-width: min(420px, 100%);
                border-radius: 10px;
            }

            .vk-p2p-media-preview audio {
                width: min(420px, 100%);
            }

            .vk-p2p-media-error {
                font-size: 12px;
                line-height: 1.35;
                color: #b91c1c;
            }
        `;

        document.head.appendChild(style);
    }
