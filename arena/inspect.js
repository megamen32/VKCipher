#!/usr/bin/env node
const fs = require('node:fs');
const creator = require('./creator/submission');
const { inspectVkMessage, simulateVkTransport, sealMessage, openMessage } = require('./sdk');

function readPlainText(args) {
    const plainIndex = args.indexOf('--plain');
    if (plainIndex >= 0 && args[plainIndex + 1]) return args[plainIndex + 1];
    if (!process.stdin.isTTY) return fs.readFileSync(0, 'utf8').trimEnd();
    throw new Error('Use --plain "text" or pipe plaintext through stdin');
}

const plainText = readPlainText(process.argv.slice(2));
const payload = sealMessage(plainText, 999999);
const context = { locale: 'ru-RU', maxUtf16Units: 4096 };
const encoded = creator.encode({ payload, context });
const transported = simulateVkTransport(encoded);
const inspection = inspectVkMessage(transported);
const decoded = creator.decode({ message: transported, context });
const recovered = decoded ? openMessage(decoded) : '';

process.stdout.write(`${JSON.stringify({
    creator: creator.name,
    plainText,
    encoded,
    inspection,
    roundTrip: recovered === plainText,
    expansion: transported.length / Math.max(Array.from(plainText).length, 1),
}, null, 2)}\n`);
