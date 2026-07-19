#!/usr/bin/env node
const creator = require('./creator/submission');
const critic = require('./critic/submission');
const { runArena } = require('./referee');

function parseRounds(args) {
    const argument = args.find(value => value.startsWith('--rounds='));
    if (!argument) return 96;
    const rounds = Number(argument.split('=')[1]);
    if (!Number.isInteger(rounds) || rounds < 8 || rounds > 10000) {
        throw new Error('--rounds must be an integer from 8 to 10000');
    }
    return rounds;
}

const json = process.argv.includes('--json');
const result = runArena({ creator, critic, rounds: parseRounds(process.argv.slice(2)) });

if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
    const percent = value => `${(value * 100).toFixed(1)}%`;
    process.stdout.write([
        `Creator: ${result.creator}`,
        `Critic: ${result.critic}`,
        `Rounds: ${result.rounds} train + ${result.rounds} blind evaluation`,
        `Round-trip: ${percent(result.reliability)}`,
        `VK transport pass: ${percent(result.transportPass)}`,
        `Average UTF-16 expansion: ${result.averageExpansion.toFixed(2)}x`,
        `Critic ROC-AUC: ${result.auc.toFixed(4)}`,
        `Critic TPR/FPR: ${percent(result.metrics.truePositiveRate)} / ${percent(result.metrics.falsePositiveRate)}`,
        `Creator score: ${result.creatorScore.toFixed(2)} / 100`,
        `Critic score: ${result.criticScore.toFixed(2)} / 100`,
    ].join('\n') + '\n');
}
