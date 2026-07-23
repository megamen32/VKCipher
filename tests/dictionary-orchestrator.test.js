const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildDictionary } = require('../arena/build-word-dictionary');
const { parseCandidateResponse, parseRiskResponse } = require('../arena/dictionary-llm');
const { runIteration } = require('../arena/iterate-dictionary');

function completion(content) {
    return JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

function wordsFromPrompt(prompt) {
    const marker = 'Слова: ';
    return JSON.parse(prompt.slice(prompt.lastIndexOf(marker) + marker.length).trim());
}

test('real-source dictionary builder produces only validated, non-denylisted words', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vkencrypt-dictionary-'));
    const output = path.join(tempDir, 'dictionary.txt');
    const source = path.join(tempDir, '05-dictionary.js');
    try {
        const result = buildDictionary({ outputPath: output, sourcePath: source });
        const words = (await fs.readFile(output, 'utf8')).trimEnd().split('\n');
        const denylist = new Set(
            (await fs.readFile(path.join(__dirname, '..', 'extension', 'dictionaries', 'ru-common-8192-v4-denylist.txt'), 'utf8'))
                .trimEnd()
                .split('\n')
        );

        assert.equal(result.selectedWords, 8192);
        assert.equal(new Set(words).size, 8192);
        assert.equal(words.every(word => /^[а-яё]+$/u.test(word) && word.length >= 2), true);
        assert.equal(words.some(word => denylist.has(word)), false);
        assert.equal(result.sha256, 'd6ce1bca2d8715a390842773d65a88b643e9f95bec6e9e4eda7b81c0aa88a2a4');
        const generatedSource = await fs.readFile(source, 'utf8');
        assert.match(generatedSource, /RU_WORDS_DICTIONARY_SHA256/);
        assert.match(generatedSource, /\.split\(' '\)/);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});

test('candidate parser keeps only new Cyrillic words', () => {
    const body = { choices: [{ message: { content: '["дом", "one", "дом", "чай"]' } }] };
    assert.deepEqual(parseCandidateResponse(body, new Set(['чай'])), ['дом']);
});

test('candidate parser accepts a JSON array followed by model commentary', () => {
    const body = { choices: [{ message: { content: '["дом", "чай"] пояснение' } }] };
    assert.deepEqual(parseCandidateResponse(body), ['дом', 'чай']);
});

test('risk parser tolerates an extra non-matching risky word', () => {
    const body = { choices: [{ message: { content: '["туман", "лишнее"]' } }] };
    assert.deepEqual(parseRiskResponse(body, ['дом', 'туман']), ['safe', 'borderline']);
});

test('iterative orchestrator critiques only new words and performs a final full pass', async () => {
    const reviewPayloads = [];
    const discoveryPayloads = [];
    const server = http.createServer(async (request, response) => {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const payload = JSON.parse(raw);
        const prompt = payload.messages[1].content;
        if (prompt.includes('Слова: ')) {
            const words = wordsFromPrompt(prompt);
            reviewPayloads.push(words);
            const risky = words.filter(word => word === 'туман');
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(completion(risky));
            return;
        }
        discoveryPayloads.push(payload.model);
        const candidates = payload.model === 'gemma4'
            ? ['поле', 'дом', 'вода']
            : ['снег', 'поле', 'река'];
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(completion(candidates));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vkencrypt-iterative-'));
    const output = path.join(tempDir, 'checkpoint.json');
    try {
        const result = await runIteration({
            input: 'mock-dictionary.txt',
            inputWords: ['дом', 'туман'],
            denylist: new Set(['вода']),
            output,
            baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
            apiKey: 'test-only',
            models: ['gemma4', 'gemma4', 'qwen3.5', 'qwen3.5'],
            rounds: 4,
            targetWords: 4,
            oversample: 2,
            batchSize: 16,
            concurrency: 1,
            newPerModel: 3,
            maxCandidates: 16,
        });

        assert.equal(result.status, 'complete');
        assert.equal(result.rounds.length, 2);
        assert.deepEqual(result.rounds[0].reviewedWords, ['дом', 'туман']);
        assert.deepEqual(result.rounds[1].reviewedWords.sort(), ['поле', 'река', 'снег'].sort());
        assert.equal(result.rounds[0].denylistedCount, 1);
        assert.equal(result.rounds[1].reviewedWords.includes('дом'), false);
        assert.equal(result.finalPass.reviewedCount, 5);
        assert.equal(result.finalPass.safeWords.length, 4);
        assert.deepEqual([...new Set(discoveryPayloads)].sort(), ['gemma4', 'qwen3.5']);
        assert.deepEqual(Object.keys(result.finalPass.decisions[0].labels).sort(), ['gemma4', 'gemma4#2', 'qwen3.5', 'qwen3.5#2']);
        assert.equal(reviewPayloads.some(words => words.length === 5), true);
        assert.equal(result.seenWords.includes('вода'), true);
        assert.equal(result.acceptedWords.includes('вода'), false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});
