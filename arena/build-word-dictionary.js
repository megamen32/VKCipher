#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_FREQUENCY = path.join(__dirname, 'sources', 'frequencywords', 'ru_50k.txt');
const DEFAULT_HUNSPELL = path.join(__dirname, 'sources', 'hunspell', 'index.dic');
const DEFAULT_DENYLIST = path.join(
    ROOT,
    'extension',
    'dictionaries',
    'ru-common-8192-v4-denylist.txt'
);
const DEFAULT_OUTPUT = path.join(ROOT, 'extension', 'dictionaries', 'ru-common-8192-v4.txt');
const DEFAULT_SOURCE = path.join(ROOT, 'extension', 'src', '05-dictionary.js');
const TARGET_WORDS = 8192;

function readLines(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .replace(/^\uFEFF/u, '')
        .split(/\r?\n/u)
        .map(line => line.trim())
        .filter(Boolean);
}

function normalizeWord(word) {
    return String(word || '').normalize('NFC').toLocaleLowerCase('ru-RU');
}

function isRussianWord(word) {
    return /^[а-яё]+$/u.test(word) && [...word].length >= 2;
}

function readFrequencyWords(filePath) {
    const words = [];
    const seen = new Set();

    for (const line of readLines(filePath)) {
        const word = normalizeWord(line.split(/\s+/u)[0]);
        if (!isRussianWord(word) || seen.has(word)) continue;
        seen.add(word);
        words.push(word);
    }

    return words;
}

function readHunspellWords(filePath) {
    const lines = readLines(filePath);
    const words = new Set();

    for (const line of lines.slice(1)) {
        const word = normalizeWord(line.split('/', 1)[0]);
        if (isRussianWord(word)) words.add(word);
    }

    return words;
}

function readDenylist(filePath) {
    return new Set(readLines(filePath).map(normalizeWord).filter(isRussianWord));
}

function buildDictionary({
    frequencyPath = DEFAULT_FREQUENCY,
    hunspellPath = DEFAULT_HUNSPELL,
    denylistPath = DEFAULT_DENYLIST,
    outputPath = DEFAULT_OUTPUT,
    sourcePath = DEFAULT_SOURCE,
    target = TARGET_WORDS,
    updateSource = true,
} = {}) {
    const frequencyWords = readFrequencyWords(frequencyPath);
    const hunspellWords = readHunspellWords(hunspellPath);
    const denylist = readDenylist(denylistPath);
    const words = frequencyWords.filter(word => hunspellWords.has(word) && !denylist.has(word));

    if (words.length < target) {
        throw new Error(`Недостаточно подтверждённых слов: ${words.length}/${target}`);
    }

    const selected = words.slice(0, target);
    const output = `${selected.join('\n')}\n`;
    const sha256 = crypto.createHash('sha256').update(output, 'utf8').digest('hex');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');

    if (updateSource) {
        const source = [
            `    const RU_WORDS_DICTIONARY_SHA256 = ${JSON.stringify(sha256)};`,
            `    const RU_WORDS_DICTIONARY = ${JSON.stringify(selected.join(' '))}.split(' ');`,
            '',
        ].join('\n');
        fs.writeFileSync(sourcePath, source, 'utf8');
    }

    return {
        frequencyWords: frequencyWords.length,
        hunspellWords: hunspellWords.size,
        deniedWords: denylist.size,
        confirmedWords: words.length,
        selectedWords: selected.length,
        sha256,
        firstWords: selected.slice(0, 10),
        lastWords: selected.slice(-10),
        outputPath,
        sourcePath: updateSource ? sourcePath : null,
    };
}

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (arg === '--no-update-source') options.updateSource = false;
        else if (arg.startsWith('--target=')) options.target = Number(arg.slice('--target='.length));
        else if (arg.startsWith('--frequency=')) options.frequencyPath = path.resolve(arg.slice('--frequency='.length));
        else if (arg.startsWith('--hunspell=')) options.hunspellPath = path.resolve(arg.slice('--hunspell='.length));
        else if (arg.startsWith('--denylist=')) options.denylistPath = path.resolve(arg.slice('--denylist='.length));
        else if (arg.startsWith('--output=')) options.outputPath = path.resolve(arg.slice('--output='.length));
        else throw new Error(`Неизвестный аргумент: ${arg}`);
    }

    options.target = options.target ?? TARGET_WORDS;
    if (!Number.isInteger(options.target) || options.target <= 0) {
        throw new Error('target должен быть положительным целым числом');
    }
    return options;
}

if (require.main === module) {
    try {
        const result = buildDictionary(parseArgs(process.argv.slice(2)));
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(`Ошибка сборки словаря: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    buildDictionary,
    isRussianWord,
    normalizeWord,
    readDenylist,
    readFrequencyWords,
    readHunspellWords,
};
