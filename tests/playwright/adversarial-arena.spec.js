const { test, expect } = require('@playwright/test');
const creator = require('../../arena/creator/submission');
const critic = require('../../arena/critic/submission');
const { runArena } = require('../../arena/referee');
const {
    inspectVkMessage,
    simulateVkTransport,
    sealMessage,
    openMessage,
} = require('../../arena/sdk');

test('arena: creator и critic проходят полный blind раунд через referee', () => {
    const result = runArena({ creator, critic, rounds: 48, seed: 123456 });

    expect(result.reliability).toBe(1);
    expect(result.transportPass).toBe(1);
    expect(result.invalidExamples).toEqual([]);
    expect(result.auc).toBeGreaterThan(0.95);
    expect(result.metrics.falsePositiveRate).toBeLessThan(0.1);
    expect(result.metrics.truePositiveRate).toBeGreaterThan(0.9);
});

test('arena: консервативный лимит считает UTF-16 emoji как две единицы', () => {
    const withinLimit = inspectVkMessage('😀'.repeat(2048));
    const overLimit = inspectVkMessage('😀'.repeat(2049));
    const tooManyAscii = inspectVkMessage('a'.repeat(4097));

    expect(withinLimit.valid).toBe(true);
    expect(withinLimit.utf16Units).toBe(4096);
    expect(overLimit.errors).toContain('utf16-limit');
    expect(tooManyAscii.errors).toContain('code-point-limit');
});

test('arena: VK normalisation не ломает creator round-trip и GCM tag', () => {
    const plainText = 'Секрет с emoji 🤫 и переносом\nстроки';
    const payload = sealMessage(plainText, 777);
    const context = { locale: 'ru-RU', maxUtf16Units: 4096 };
    const message = creator.encode({ payload, context });
    const transported = simulateVkTransport(`  ${message}\r\n`.trimEnd());
    const decoded = creator.decode({ message: transported, context });

    expect(openMessage(decoded)).toBe(plainText);

    const symbols = Array.from(transported);
    symbols[0] = symbols[0] === '😀' ? '😁' : '😀';
    const tampered = creator.decode({ message: symbols.join(''), context });
    expect(() => openMessage(tampered)).toThrow();
});

test('arena: emoji после VK-подобного IMG alt DOM снова декодируются', async ({ page }) => {
    const plainText = 'DOM round-trip для emoji';
    const payload = sealMessage(plainText, 888);
    const context = { locale: 'ru-RU', maxUtf16Units: 4096 };
    const message = creator.encode({ payload, context });

    await page.setContent('<div class="ConvoMessage__text"></div>');
    await page.locator('.ConvoMessage__text').evaluate((element, symbols) => {
        symbols.forEach(symbol => {
            const image = document.createElement('img');
            image.className = 'Emoji';
            image.alt = symbol;
            element.appendChild(image);
        });
    }, Array.from(message));

    const extracted = await page.locator('.ConvoMessage__text').evaluate(element => {
        const read = node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
            return Array.from(node.childNodes).map(read).join('');
        };
        return read(element).trim();
    });
    const decoded = creator.decode({ message: extracted, context });

    expect(extracted).toBe(message);
    expect(openMessage(decoded)).toBe(plainText);
});
