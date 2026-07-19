#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_INPUT = path.join(__dirname, '..', 'extension', 'dictionaries', 'ru-common-8192-v3.txt');
const DEFAULT_OUTPUT = path.join(__dirname, 'artifacts', 'dictionary-safety.json');
const DEFAULT_BASE_URL = 'https://llm.bezrabotnyi.com/v1';
const DEFAULT_MODELS = ['gemma4', 'qwen3.5'];
const DEFAULT_BATCH_SIZE = 256;

function getArgument(name, fallback) {
    const prefix = `--${name}=`;
    const value = process.argv.find(argument => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
}

function parseResponse(body, words) {
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM response has no chat completion content');
    const json = content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '').trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error('LLM response must be a JSON array');
    if (parsed.every(word => typeof word === 'string') && parsed.every(word => words.includes(word))) {
        const risky = new Set(parsed);
        return words.map(word => risky.has(word) ? 'borderline' : 'safe');
    }
    if (parsed.every(label => typeof label === 'string')) {
        if (parsed.length !== words.length) throw new Error(`LLM response must contain exactly ${words.length} labels`);
        return parsed.map(label => ({ S: 'safe', B: 'borderline', U: 'unsafe' }[label] || label));
    }
    if (parsed.every(row => row && typeof row.word === 'string' && typeof row.label === 'string')) {
        const byWord = new Map(parsed.map(row => [row.word, row.label]));
        return words.map(word => byWord.get(word) || 'borderline');
    }
    throw new Error('LLM response has an unsupported label format');
}

function makePrompt(words) {
    return [
        'Классифицируй русские слова по безопасности для нейтрального словаря шифротекста.',
        'Оцени слово только в изоляции, без придуманных предложений.',
        'safe: бытовое, нейтральное, не связанное с насилием, оружием, самоповреждением, наркотиками, преступлениями, экстремизмом, сексуальным контентом или политическим насилием.',
        'borderline: двусмысленное, потенциально чувствительное, имя собственное, жаргон или слово, которое отдельные фильтры могут пометить.',
        'unsafe: явно относится к опасной или запрещённой теме.',
        'Для максимальной консервативности оставляй только safe. Верни только JSON-массив строк: перечисли точные слова, которые borderline или unsafe. Safe-слова не перечисляй. Если все слова safe, верни []. Не добавляй пояснений и не меняй написание.',
        `Слова: ${JSON.stringify(words)}`,
    ].join('\n');
}

async function classifyBatch({ baseUrl, apiKey, model, words }) {
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/u, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${apiKey}`,
                'content-type': 'application/json',
            },
            signal: AbortSignal.timeout(90_000),
            body: JSON.stringify({
                model,
                temperature: 0,
                messages: [
                    { role: 'system', content: 'Ты строгий классификатор слов. Не добавляй пояснений вне JSON.' },
                    { role: 'user', content: makePrompt(words) },
                ],
            }),
        });
        if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const labels = parseResponse(await response.json(), words);
        return words.map((word, index) => ({
            word,
            label: ['safe', 'borderline', 'unsafe'].includes(labels[index]) ? labels[index] : 'safe',
        }));
    } catch (error) {
        if (words.length <= 16) throw error;
        const midpoint = Math.ceil(words.length / 2);
        const left = await classifyBatch({ baseUrl, apiKey, model, words: words.slice(0, midpoint) });
        const right = await classifyBatch({ baseUrl, apiKey, model, words: words.slice(midpoint) });
        return [...left, ...right];
    }
}

async function main() {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('Set LLM_API_KEY in the environment; never put it in source or fixtures');

    const input = getArgument('input', DEFAULT_INPUT);
    const output = getArgument('output', DEFAULT_OUTPUT);
    const batchSize = Number(getArgument('batch-size', DEFAULT_BATCH_SIZE));
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1024) throw new Error('--batch-size must be 1..1024');
    const concurrency = Number(getArgument('concurrency', 4));
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('--concurrency must be 1..8');

    const words = (await fs.readFile(input, 'utf8')).trimEnd().split('\n');
    const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
    const models = (process.env.LLM_MODELS || process.env.LLM_MODEL || DEFAULT_MODELS.join(','))
        .split(',')
        .map(model => model.trim())
        .filter(Boolean);
    if (!models.length) throw new Error('Set LLM_MODELS to at least one model');
    const batches = [];
    for (let offset = 0; offset < words.length; offset += batchSize) {
        batches.push({ offset, words: words.slice(offset, offset + batchSize) });
    }
    const decisions = new Array(words.length);
    let nextBatch = 0;
    async function worker() {
        while (nextBatch < batches.length) {
            const batch = batches[nextBatch++];
            const modelResults = await Promise.all(models.map(async model => ({
                model,
                decisions: await classifyBatch({ baseUrl, apiKey, model, words: batch.words })
            })));
            modelResults.forEach(result => {
                result.decisions.forEach((decision, index) => {
                    decisions[batch.offset + index] ||= {
                        word: batch.words[index],
                        labels: {}
                    };
                    decisions[batch.offset + index].labels[result.model] = decision.label;
                });
            });
            decisions.slice(batch.offset, batch.offset + batch.words.length).forEach(decision => {
                const labels = Object.values(decision.labels);
                decision.label = labels.includes('unsafe')
                    ? 'unsafe'
                    : labels.includes('borderline')
                        ? 'borderline'
                        : 'safe';
            });
            process.stderr.write(`classified ${decisions.filter(Boolean).length}/${words.length}\n`);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify({
        baseUrl,
        models,
        policy: 'safe only when every model returns safe; borderline or unsafe wins',
        input,
        decisions
    }, null, 2)}\n`);
    process.stdout.write(`Wrote ${decisions.length} decisions to ${output}\n`);
}

main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
