const { normalMessages, secretMessages } = require('./corpus/messages');
const {
    inspectVkMessage,
    simulateVkTransport,
    sealMessage,
    openMessage,
    makeRng,
} = require('./sdk');

function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
}

function makeNormalMessage(index, rng) {
    const prefixes = ['', '', '', 'слушай, ', 'кстати, '];
    const suffixes = ['', '', '!', '))', ' 👍', ' 😂'];
    return `${pick(prefixes, rng)}${normalMessages[index % normalMessages.length]}${pick(suffixes, rng)}`;
}

function makeSecretMessage(index, rng) {
    const suffixes = ['', ` Номер проверки: ${100 + index}.`, ' Подтверждаю.', ''];
    return `${secretMessages[index % secretMessages.length]}${pick(suffixes, rng)}`;
}

function buildCases({ creator, count, seed, offset }) {
    const rng = makeRng(seed);
    const normal = [];
    const protectedCases = [];

    for (let index = 0; index < count; index += 1) {
        const roundId = offset + index;
        const normalMessage = simulateVkTransport(makeNormalMessage(roundId, rng));
        normal.push({ message: normalMessage, label: 0, inspection: inspectVkMessage(normalMessage) });

        const plainText = makeSecretMessage(roundId, rng);
        const sealed = sealMessage(plainText, roundId);
        let encoded = '';
        let creatorError = '';
        try {
            encoded = creator.encode({
                payload: Buffer.from(sealed),
                context: { locale: 'ru-RU', maxUtf16Units: 4096 },
                random: rng,
            });
        } catch (error) {
            creatorError = error.message;
        }

        const transported = simulateVkTransport(String(encoded || ''));
        const inspection = inspectVkMessage(transported);
        let recovered = '';
        let roundTrip = false;
        let decodeError = '';
        try {
            const decoded = creator.decode({
                message: transported,
                context: { locale: 'ru-RU', maxUtf16Units: 4096 },
            });
            if (decoded) {
                recovered = openMessage(decoded);
                roundTrip = recovered === plainText;
            }
        } catch (error) {
            decodeError = error.message;
        }

        protectedCases.push({
            message: transported,
            label: 1,
            plainText,
            creatorError,
            decodeError,
            roundTrip,
            inspection,
        });
    }

    return { normal, protectedCases };
}

function areaUnderCurve(normalScores, protectedScores) {
    let wins = 0;
    let ties = 0;
    protectedScores.forEach(protectedScore => {
        normalScores.forEach(normalScore => {
            if (protectedScore > normalScore) wins += 1;
            if (protectedScore === normalScore) ties += 1;
        });
    });
    return (wins + (ties * 0.5)) / (normalScores.length * protectedScores.length);
}

function chooseThreshold(samples) {
    const candidates = [...new Set(samples.map(sample => sample.score))].sort((a, b) => a - b);
    candidates.unshift(0);
    candidates.push(1);
    let best = { threshold: 0.5, balancedAccuracy: -1, falsePositiveRate: 1 };

    candidates.forEach(threshold => {
        const normal = samples.filter(sample => sample.label === 0);
        const protectedSamples = samples.filter(sample => sample.label === 1);
        const trueNegativeRate = normal.filter(sample => sample.score < threshold).length / normal.length;
        const truePositiveRate = protectedSamples.filter(sample => sample.score >= threshold).length / protectedSamples.length;
        const falsePositiveRate = 1 - trueNegativeRate;
        const balancedAccuracy = (trueNegativeRate + truePositiveRate) / 2;
        if (
            balancedAccuracy > best.balancedAccuracy ||
            (balancedAccuracy === best.balancedAccuracy && falsePositiveRate < best.falsePositiveRate)
        ) {
            best = { threshold, balancedAccuracy, falsePositiveRate };
        }
    });
    return best;
}

function classificationMetrics(samples, threshold) {
    const counts = { tp: 0, tn: 0, fp: 0, fn: 0 };
    samples.forEach(sample => {
        const predicted = sample.score >= threshold ? 1 : 0;
        if (sample.label === 1 && predicted === 1) counts.tp += 1;
        if (sample.label === 0 && predicted === 0) counts.tn += 1;
        if (sample.label === 0 && predicted === 1) counts.fp += 1;
        if (sample.label === 1 && predicted === 0) counts.fn += 1;
    });
    const tpr = counts.tp / Math.max(counts.tp + counts.fn, 1);
    const tnr = counts.tn / Math.max(counts.tn + counts.fp, 1);
    return {
        ...counts,
        truePositiveRate: tpr,
        falsePositiveRate: 1 - tnr,
        balancedAccuracy: (tpr + tnr) / 2,
    };
}

function safeScore(critic, message, model) {
    const value = Number(critic.score({ message, model }));
    if (!Number.isFinite(value)) return 0.5;
    return Math.max(0, Math.min(1, value));
}

function evaluateScores(critic, model, cases) {
    return [
        ...cases.normal.map(sample => ({ ...sample, score: safeScore(critic, sample.message, model) })),
        ...cases.protectedCases.map(sample => ({ ...sample, score: safeScore(critic, sample.message, model) })),
    ];
}

function runArena({ creator, critic, rounds = 96, seed = 0xC0DEC0DE } = {}) {
    if (!creator?.encode || !creator?.decode) throw new Error('Creator submission is invalid');
    if (!critic?.train || !critic?.score) throw new Error('Critic submission is invalid');

    const trainingCases = buildCases({ creator, count: rounds, seed, offset: 0 });
    const trainingSamples = [
        ...trainingCases.normal.map(({ message, label }) => ({ message, label })),
        ...trainingCases.protectedCases.map(({ message, label }) => ({ message, label })),
    ];
    const model = critic.train(trainingSamples);
    const trainingScores = evaluateScores(critic, model, trainingCases);
    const threshold = chooseThreshold(trainingScores).threshold;

    const evaluationCases = buildCases({
        creator,
        count: rounds,
        seed: seed ^ 0x9E3779B9,
        offset: rounds * 10,
    });
    const evaluationScores = evaluateScores(critic, model, evaluationCases);
    const normalScores = evaluationScores.filter(sample => sample.label === 0).map(sample => sample.score);
    const protectedScores = evaluationScores.filter(sample => sample.label === 1).map(sample => sample.score);
    const auc = areaUnderCurve(normalScores, protectedScores);
    const metrics = classificationMetrics(evaluationScores, threshold);
    const protectedCases = evaluationCases.protectedCases;
    const reliable = protectedCases.filter(sample => sample.roundTrip).length / protectedCases.length;
    const transportPass = protectedCases.filter(sample => sample.inspection.valid).length / protectedCases.length;
    const averageExpansion = protectedCases.reduce((sum, sample) => (
        sum + (sample.inspection.utf16Units / Math.max(Array.from(sample.plainText).length, 1))
    ), 0) / protectedCases.length;
    const stealth = Math.max(0, Math.min(1, 2 * (1 - auc)));
    const efficiency = Math.min(1, 1 / Math.max(averageExpansion, 1));
    const creatorScore = 100 * reliable * transportPass * ((0.75 * stealth) + (0.25 * efficiency));
    const criticScore = 100 * Math.max(0, Math.min(1, 2 * (auc - 0.5)));

    return {
        creator: creator.name || 'unnamed-creator',
        critic: critic.name || 'unnamed-critic',
        rounds,
        threshold,
        auc,
        metrics,
        reliability: reliable,
        transportPass,
        averageExpansion,
        creatorScore,
        criticScore,
        invalidExamples: protectedCases
            .filter(sample => !sample.inspection.valid || !sample.roundTrip)
            .slice(0, 3)
            .map(sample => ({
                errors: sample.inspection.errors,
                creatorError: sample.creatorError,
                decodeError: sample.decodeError,
                roundTrip: sample.roundTrip,
            })),
    };
}

module.exports = { runArena };
