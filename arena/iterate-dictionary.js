#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { classifyBatch, suggestCandidates } = require('./dictionary-llm');

const DEFAULT_INPUT = path.join(__dirname, '..', 'extension', 'dictionaries', 'ru-common-8192-v4.txt');
const DEFAULT_DENYLIST = path.join(__dirname, '..', 'extension', 'dictionaries', 'ru-common-8192-v4-denylist.txt');
const DEFAULT_OUTPUT = path.join(__dirname, 'artifacts', 'dictionary-safety-iterative.json');
const DEFAULT_BASE_URL = 'https://llm.bezrabotnyi.com/v1';
const DEFAULT_MODELS = ['gemma4', 'qwen3.5'];

function getArgument(name, fallback) {
    const prefix = `--${name}=`;
    const value = process.argv.find(argument => argument.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
}

function getIntegerArgument(name, fallback, min, max) {
    const value = Number(getArgument(name, fallback));
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`--${name} must be an integer from ${min} to ${max}`);
    }
    return value;
}

function uniqueWords(text) {
    return [...new Set(text.split(/\r?\n/u).map(word => word.trim()).filter(Boolean))];
}

function countLabels(decisions) {
    return decisions.reduce((counts, decision) => {
        counts[decision.label] = (counts[decision.label] || 0) + 1;
        return counts;
    }, {});
}

function normaliseModelSpecs(models) {
    const occurrences = new Map();
    return models.map(entry => {
        const model = typeof entry === 'string' ? entry : entry.model;
        const count = (occurrences.get(model) || 0) + 1;
        occurrences.set(model, count);
        return {
            model,
            id: typeof entry === 'string'
                ? (count === 1 ? model : `${model}#${count}`)
                : (entry.id || `${model}#${count}`),
        };
    });
}

function ensembleLabels(labels, models) {
    const values = normaliseModelSpecs(models).map(spec => labels[spec.id] || 'borderline');
    return values.includes('unsafe')
        ? 'unsafe'
        : values.includes('borderline')
            ? 'borderline'
            : 'safe';
}

async function reviewWords({ words, models, baseUrl, apiKey, batchSize, concurrency, fetchImpl, timeoutMs }) {
    const modelSpecs = normaliseModelSpecs(models);
    const batches = [];
    for (let offset = 0; offset < words.length; offset += batchSize) {
        batches.push({ offset, words: words.slice(offset, offset + batchSize) });
    }
    const records = new Array(words.length);
    const retryWords = new Set();
    let nextBatch = 0;

    async function worker() {
        while (nextBatch < batches.length) {
            const batch = batches[nextBatch++];
            const modelResults = await Promise.all(modelSpecs.map(async spec => {
                try {
                    return {
                        id: spec.id,
                        decisions: await classifyBatch({
                            baseUrl,
                            apiKey,
                            model: spec.model,
                            words: batch.words,
                            fetchImpl,
                            timeoutMs,
                        }),
                    };
                } catch (error) {
                    process.stderr.write(`reviewer ${spec.id} failed: ${error.message}\n`);
                    return { id: spec.id, error };
                }
            }));
            if (modelResults.some(result => result.error)) {
                batch.words.forEach(word => retryWords.add(word));
                continue;
            }
            modelResults.forEach(result => result.decisions.forEach((decision, index) => {
                records[batch.offset + index] ||= { word: decision.word, labels: {} };
                records[batch.offset + index].labels[result.id] = decision.label;
            }));
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length || 1) }, worker));
    return {
        decisions: records.filter(Boolean).map(record => ({
            ...record,
            label: ensembleLabels(record.labels, modelSpecs),
        })),
        retryWords: [...retryWords],
    };
}

async function discoverWords({ models, baseUrl, apiKey, acceptedWords, requestedCount, seen, round, fetchImpl, timeoutMs }) {
    const modelSpecs = normaliseModelSpecs(models);
    const contextWords = acceptedWords.length ? acceptedWords.slice(-128) : [...seen].slice(-128);
    const avoidWords = [...seen].slice(-128);
    const suggestions = [];
    let failures = 0;
    for (const spec of modelSpecs) {
        try {
            suggestions.push(await suggestCandidates({
                baseUrl,
                apiKey,
                model: spec.model,
                contextWords,
                avoidWords: [...avoidWords, `раунд${round}`],
                requestedCount,
                seen,
                fetchImpl,
                timeoutMs,
            }));
        } catch (error) {
            process.stderr.write(`candidate scout ${spec.id} failed: ${error.message}\n`);
            suggestions.push([]);
            failures += 1;
        }
    }
    const result = [];
    const emitted = new Set();
    suggestions.flat().forEach(word => {
        if (seen.has(word) || emitted.has(word)) return;
        emitted.add(word);
        result.push(word);
    });
    return { words: result, failures };
}

function buildCheckpoint({ config, state }) {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ...config,
        ...state,
    };
}

async function writeCheckpoint(output, checkpoint) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

async function askToContinue() {
    const prompt = readline.createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question('Продолжить следующий раунд? [Y/n] ');
    prompt.close();
    return !/^n(?:o)?$/iu.test(answer.trim());
}

async function runIteration({
    inputWords,
    input = DEFAULT_INPUT,
    denylist = new Set(),
    output = DEFAULT_OUTPUT,
    baseUrl = DEFAULT_BASE_URL,
    apiKey,
    models = DEFAULT_MODELS,
    rounds = 12,
    targetWords = 8192,
    oversample = 2,
    batchSize = 256,
    concurrency = 1,
    newPerModel = 256,
    stallRounds = 2,
    maxCandidates = targetWords * oversample * 2,
    fetchImpl,
    timeoutMs = 90_000,
    interactive = false,
    resume = false,
}) {
    if (!apiKey) throw new Error('Set LLM_API_KEY in the environment; never put it in source or fixtures');
    if (!models.length) throw new Error('Set LLM_MODELS to at least one model');
    if (!Number.isInteger(oversample) || oversample < 1 || oversample > 10) throw new Error('oversample must be an integer from 1 to 10');
    const collectionTarget = targetWords * oversample;
    if (maxCandidates < collectionTarget) throw new Error('maxCandidates must be at least targetWords * oversample');
    const rejectedSeedCount = [...new Set(inputWords)].filter(word => denylist.has(word)).length;
    const seedWords = [...new Set(inputWords)].filter(word => !denylist.has(word)).slice(0, maxCandidates);
    if (!seedWords.length) throw new Error('The dictionary input is empty');

    let state = {
        status: 'running',
        nextWords: seedWords,
        seenWords: seedWords,
        acceptedWords: [],
        records: [],
        rounds: [],
        finalPass: null,
    };
    if (resume) {
        const saved = JSON.parse(await fs.readFile(output, 'utf8'));
        if (saved.status === 'complete') throw new Error('Checkpoint is already complete; choose another --output');
        state = {
            status: 'running',
            finalPass: null,
            nextWords: saved.nextWords || [],
            seenWords: saved.seenWords || seedWords,
            acceptedWords: saved.acceptedWords || [],
            records: saved.records || [],
            rounds: saved.rounds || [],
        };
    }

    const recordByWord = new Map(state.records.map(record => [record.word, record]));
    const accepted = new Set(state.acceptedWords);
    const seen = new Set(state.seenWords);
    let nextWords = state.nextWords;
    let stalled = 0;
    const modelSpecs = normaliseModelSpecs(models);
    const config = {
        input,
        baseUrl,
        models: modelSpecs.map(spec => spec.id),
        policy: 'safe only when every model returns safe; borderline or unsafe wins',
        targetWords,
        oversample,
        collectionTarget,
        maxRounds: rounds,
        batchSize,
        newPerModel,
        maxCandidates,
        rejectedSeedCount,
    };

    for (let round = state.rounds.length + 1; round <= rounds && (seen.size < collectionTarget || nextWords.length > 0); round += 1) {
        const pending = nextWords.filter(word => !recordByWord.has(word));
        const review = pending.length ? await reviewWords({
            words: pending,
            models: modelSpecs,
            baseUrl,
            apiKey,
            batchSize,
            concurrency,
            fetchImpl,
            timeoutMs,
        }) : { decisions: [], retryWords: [] };
        const reviewed = review.decisions;
        const newSafe = reviewed.filter(record => record.label === 'safe');
        reviewed.forEach(record => {
            recordByWord.set(record.word, record);
            if (record.label === 'safe') accepted.add(record.word);
        });

        let proposed = [];
        let discovered = [];
        let discoveryFailures = 0;
        if (seen.size < collectionTarget && seen.size < maxCandidates) {
            const discovery = await discoverWords({
                models: modelSpecs,
                baseUrl,
                apiKey,
                acceptedWords: [...accepted],
                requestedCount: newPerModel,
                seen,
                round,
                fetchImpl,
                timeoutMs,
            });
            discovered = discovery.words;
            discoveryFailures = discovery.failures;
            discovered = discovered.slice(0, maxCandidates - seen.size);
            proposed = discovered.filter(word => !denylist.has(word));
        }
        discovered.forEach(word => {
            seen.add(word);
        });
        nextWords = [...new Set([...review.retryWords, ...proposed])];
        stalled = nextWords.length ? 0 : stalled + 1;
        state.rounds.push({
            round,
            reviewedCount: reviewed.length,
            reviewedWords: reviewed.map(record => record.word),
            retryCount: review.retryWords.length,
            newSafeCount: newSafe.length,
            newSafeWords: newSafe.map(record => record.word),
            proposedCount: proposed.length,
            proposedWords: proposed,
            denylistedCount: discovered.length - proposed.length,
            discoveryFailures,
            acceptedCount: accepted.size,
            seenCount: seen.size,
        });
        state.nextWords = nextWords;
        state.seenWords = [...seen];
        state.acceptedWords = [...accepted];
        state.records = [...recordByWord.values()];
        await writeCheckpoint(output, buildCheckpoint({ config, state }));
        process.stderr.write(`round ${round}: reviewed ${reviewed.length}, proposed ${proposed.length}, pool ${seen.size}/${collectionTarget}, safe ${accepted.size}\n`);

        if (interactive && !(await askToContinue())) break;
        if ((!nextWords.length && discoveryFailures === 0) || (stalled >= stallRounds && discoveryFailures === 0)) break;
    }

    const finalWords = [...recordByWord.keys()].slice(0, maxCandidates);
    let finalDecisions = [];
    try {
        const finalReview = finalWords.length ? await reviewWords({
            words: finalWords,
            models: modelSpecs,
            baseUrl,
            apiKey,
            batchSize,
            concurrency,
            fetchImpl,
            timeoutMs,
        }) : { decisions: [], retryWords: [] };
        if (finalReview.retryWords.length) {
            throw new Error(`Final pass has ${finalReview.retryWords.length} words waiting for reviewer retry`);
        }
        finalDecisions = finalReview.decisions;
    } catch (error) {
        state.status = 'blocked';
        state.error = error.message;
        state.finalPass = null;
        state.nextWords = nextWords;
        state.seenWords = [...seen];
        state.acceptedWords = [...accepted];
        state.records = [...recordByWord.values()];
        await writeCheckpoint(output, buildCheckpoint({ config, state }));
        return buildCheckpoint({ config, state });
    }
    const finalSafeWords = finalDecisions.filter(record => record.label === 'safe').map(record => record.word);
    state.finalPass = {
        reviewedCount: finalDecisions.length,
        counts: countLabels(finalDecisions),
        decisions: finalDecisions,
        safeWords: finalSafeWords,
        selectedWords: finalSafeWords.slice(0, targetWords),
    };
    state.status = finalSafeWords.length >= targetWords ? 'complete' : 'converged-below-target';
    state.nextWords = [];
    await writeCheckpoint(output, buildCheckpoint({ config, state }));
    return buildCheckpoint({ config, state });
}

async function main() {
    const apiKey = process.env.LLM_API_KEY;
    const input = getArgument('input', DEFAULT_INPUT);
    const denylistPath = getArgument('denylist', DEFAULT_DENYLIST);
    const output = getArgument('output', DEFAULT_OUTPUT);
    const models = (process.env.LLM_MODELS || process.env.LLM_MODEL || DEFAULT_MODELS.join(','))
        .split(',').map(model => model.trim()).filter(Boolean);
    const targetWords = getIntegerArgument('target', 8192, 1, 100_000);
    const oversample = getIntegerArgument('oversample', 2, 1, 10);
    const maxRounds = process.argv.some(argument => argument.startsWith('--max-rounds='))
        ? getIntegerArgument('max-rounds', 100, 1, 1_000)
        : getIntegerArgument('rounds', 100, 1, 1_000);
    const inputWords = uniqueWords(await fs.readFile(input, 'utf8'));
    const denylist = new Set(uniqueWords(await fs.readFile(denylistPath, 'utf8')));
    const result = await runIteration({
        inputWords,
        input,
        denylist,
        output,
        apiKey,
        models,
        baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
        rounds: maxRounds,
        targetWords,
        oversample,
        batchSize: getIntegerArgument('batch-size', 256, 1, 1024),
        concurrency: getIntegerArgument('concurrency', 1, 1, 8),
        newPerModel: getIntegerArgument('new-per-model', 256, 1, 1024),
        stallRounds: getIntegerArgument('stall-rounds', 2, 1, 20),
        maxCandidates: getIntegerArgument('max-candidates', targetWords * oversample * 2, 1, 100_000),
        interactive: process.argv.includes('--interactive'),
        resume: process.argv.includes('--resume'),
    });
    process.stdout.write(JSON.stringify({
        status: result.status,
        rounds: result.rounds.length,
        seedCount: result.seenWords.length,
        finalReviewed: result.finalPass?.reviewedCount ?? null,
        finalCounts: result.finalPass?.counts ?? null,
        finalSafe: result.finalPass?.safeWords.length ?? null,
        selectedSafe: result.finalPass?.selectedWords.length ?? null,
        output,
    }, null, 2) + '\n');
}

if (require.main === module) main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = {
    countLabels,
    discoverWords,
    ensembleLabels,
    reviewWords,
    runIteration,
    uniqueWords,
};
