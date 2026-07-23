#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { classifyBatch } = require('./dictionary-llm');

const DEFAULT_INPUT = path.join(__dirname, '..', 'extension', 'dictionaries', 'ru-common-8192-v4.txt');
const DEFAULT_OUTPUT = path.join(__dirname, 'artifacts', 'dictionary-safety.json');
const DEFAULT_BASE_URL = 'https://llm.bezrabotnyi.com/v1';
const DEFAULT_MODELS = ['gemma4', 'qwen3.5'];
const DEFAULT_BATCH_SIZE = 256;

function getArgument(name, fallback) {
    const prefix = `--${name}=`;
    const value = process.argv.find(argument => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
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
