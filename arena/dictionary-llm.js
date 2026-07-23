const RISK_LABELS = new Set(['safe', 'borderline', 'unsafe']);

function normaliseLabel(label) {
    const shorthand = { S: 'safe', B: 'borderline', U: 'unsafe' };
    const expanded = shorthand[label] || label;
    return RISK_LABELS.has(expanded) ? expanded : 'safe';
}

function extractJsonValue(text) {
    for (let start = 0; start < text.length; start += 1) {
        if (text[start] !== '[' && text[start] !== '{') continue;
        const opening = text[start];
        const closing = opening === '[' ? ']' : '}';
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < text.length; index += 1) {
            const character = text[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') inString = false;
                continue;
            }
            if (character === '"') {
                inString = true;
                continue;
            }
            if (character === opening) depth += 1;
            if (character === closing) depth -= 1;
            if (depth === 0) return text.slice(start, index + 1);
        }
    }
    return null;
}

function parseContent(body) {
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM response has no chat completion content');
    const json = content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '').trim();
    try {
        return JSON.parse(json);
    } catch (error) {
        const extracted = extractJsonValue(json);
        if (!extracted) throw error;
        return JSON.parse(extracted);
    }
}

function parseRiskResponse(body, words) {
    const parsed = parseContent(body);
    const list = Array.isArray(parsed) ? parsed : parsed?.labels || parsed?.decisions || parsed?.riskyWords;
    if (!Array.isArray(list)) throw new Error('LLM response must be a JSON array');

    const labelValues = new Set(['safe', 'borderline', 'unsafe', 'S', 'B', 'U']);
    if (list.length === 0) return words.map(() => 'safe');
    if (list.every(label => typeof label === 'string' && labelValues.has(label))) {
        if (list.length !== words.length) throw new Error(`LLM response must contain exactly ${words.length} labels`);
        return list.map(normaliseLabel);
    }
    if (list.every(word => typeof word === 'string')) {
        const risky = new Set(list.filter(word => words.includes(word)));
        return words.map(word => risky.has(word) ? 'borderline' : 'safe');
    }
    if (list.every(row => row && typeof row.word === 'string' && typeof row.label === 'string')) {
        const byWord = new Map(list.map(row => [row.word, normaliseLabel(row.label)]));
        return words.map(word => byWord.get(word) || 'borderline');
    }
    throw new Error('LLM response has an unsupported label format');
}

function normaliseCandidate(value, { minLength = 2, maxLength = 20 } = {}) {
    if (typeof value !== 'string') return null;
    const word = value.normalize('NFC').trim().toLocaleLowerCase('ru-RU');
    const length = [...word].length;
    if (length < minLength || length > maxLength || !/^[А-ЯЁа-яё]+$/u.test(word)) return null;
    return word;
}

function parseCandidateResponse(body, seen = new Set(), options = {}) {
    const parsed = parseContent(body);
    const list = Array.isArray(parsed) ? parsed : parsed?.candidates || parsed?.words;
    if (!Array.isArray(list)) throw new Error('LLM candidate response must be a JSON array');
    const result = [];
    const emitted = new Set();
    for (const value of list) {
        const word = normaliseCandidate(value, options);
        if (!word || seen.has(word) || emitted.has(word)) continue;
        emitted.add(word);
        result.push(word);
    }
    return result;
}

function makeReviewPrompt(words) {
    return [
        'Классифицируй русские слова по безопасности для нейтрального словаря шифротекста.',
        'Оцени слово только в изоляции, без придуманных предложений.',
        'safe: бытовое, нейтральное, не связанное с насилием, оружием, самоповреждением, наркотиками, преступлениями, экстремизмом, сексуальным контентом или политическим насилием.',
        'borderline: двусмысленное, потенциально чувствительное, имя собственное, жаргон или слово, которое отдельные фильтры могут пометить.',
        'unsafe: явно относится к опасной или запрещённой теме.',
        'Для консервативного отбора перечисли точные слова, которые borderline или unsafe. Safe-слова не перечисляй. Если все слова safe, верни []. Не добавляй пояснений и не меняй написание.',
        `Слова: ${JSON.stringify(words)}`,
    ].join('\n');
}

function makeDiscoveryPrompt({ contextWords, avoidWords = [], requestedCount }) {
    return [
        'Предложи новые короткие русские слова для нейтрального технического словаря.',
        'Нужны обычные общеупотребительные слова в нижнем регистре, только кириллица, без имён, аббревиатур, жаргона и многозначных чувствительных тем.',
        'Не используй слова, связанные с насилием, оружием, самоповреждением, наркотиками, преступлениями, экстремизмом, сексуальным контентом или политическим насилием.',
        'Верни только JSON-массив слов, без пояснений. Не повторяй слова из списков ниже.',
        `Нужно не более ${requestedCount} слов. Примеры уже принятых слов: ${JSON.stringify(contextWords)}`,
        `Уже использованные слова, которые нельзя предлагать снова: ${JSON.stringify(avoidWords)}`,
    ].join('\n');
}

function timeoutSignal(timeoutMs) {
    return typeof globalThis.AbortSignal?.timeout === 'function'
        ? globalThis.AbortSignal.timeout(timeoutMs)
        : undefined;
}

function sleep(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function postChat({
    baseUrl,
    apiKey,
    model,
    messages,
    fetchImpl = globalThis.fetch,
    timeoutMs = 90_000,
    maxAttempts = 3,
    retryDelayMs = 1_500,
}) {
    if (typeof fetchImpl !== 'function') throw new Error('Fetch API is unavailable');
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    'content-type': 'application/json',
                },
                signal: timeoutSignal(timeoutMs),
                body: JSON.stringify({ model, temperature: 0, messages }),
            });
            if (response.ok) return response.json();
            const detail = (await response.text()).slice(0, 300);
            const retryable = response.status === 429 || response.status >= 500;
            lastError = new Error(`LLM HTTP ${response.status}: ${detail}`);
            if (!retryable || attempt === maxAttempts) throw lastError;
        } catch (error) {
            lastError = error;
            const retryable = error.name === 'AbortError' || error.name === 'TypeError' || /LLM HTTP (429|5\d\d)/u.test(error.message);
            if (!retryable || attempt === maxAttempts) throw error;
        }
        await sleep(retryDelayMs * attempt);
    }
    throw lastError;
}

async function classifyBatch({ baseUrl, apiKey, model, words, fetchImpl, timeoutMs = 90_000 }) {
    try {
        const body = await postChat({
            baseUrl,
            apiKey,
            model,
            fetchImpl,
            timeoutMs,
            messages: [
                { role: 'system', content: 'Ты строгий классификатор слов. Не добавляй пояснений вне JSON.' },
                { role: 'user', content: makeReviewPrompt(words) },
            ],
        });
        const labels = parseRiskResponse(body, words);
        return words.map((word, index) => ({ word, label: normaliseLabel(labels[index]) }));
    } catch (error) {
        if (words.length <= 16) throw error;
        const midpoint = Math.ceil(words.length / 2);
        const [left, right] = await Promise.all([
            classifyBatch({ baseUrl, apiKey, model, words: words.slice(0, midpoint), fetchImpl, timeoutMs }),
            classifyBatch({ baseUrl, apiKey, model, words: words.slice(midpoint), fetchImpl, timeoutMs }),
        ]);
        return [...left, ...right];
    }
}

async function suggestCandidates({ baseUrl, apiKey, model, contextWords, avoidWords, requestedCount, seen, fetchImpl, timeoutMs = 90_000 }) {
    const body = await postChat({
        baseUrl,
        apiKey,
        model,
        fetchImpl,
        timeoutMs,
        messages: [
            { role: 'system', content: 'Ты генератор нейтральных русских слов. Не добавляй пояснений вне JSON.' },
            { role: 'user', content: makeDiscoveryPrompt({ contextWords, avoidWords, requestedCount }) },
        ],
    });
    return parseCandidateResponse(body, seen);
}

module.exports = {
    RISK_LABELS,
    classifyBatch,
    makeDiscoveryPrompt,
    makeReviewPrompt,
    normaliseCandidate,
    parseCandidateResponse,
    parseRiskResponse,
    postChat,
    suggestCandidates,
};
