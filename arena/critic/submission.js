const zlib = require('node:zlib');

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const DIGIT_RE = /\p{Number}/u;
const WHITESPACE_RE = /\s/u;

function entropy(points) {
    const counts = new Map();
    points.forEach(point => counts.set(point, (counts.get(point) || 0) + 1));
    let result = 0;
    counts.forEach(count => {
        const probability = count / points.length;
        result -= probability * Math.log2(probability);
    });
    return result;
}

function features(message) {
    const points = Array.from(message);
    const length = Math.max(points.length, 1);
    const ratio = expression => points.filter(point => expression.test(point)).length / length;
    const compressed = zlib.deflateRawSync(Buffer.from(message, 'utf8')).length;
    return [
        Math.log1p(length),
        ratio(EMOJI_RE),
        ratio(CYRILLIC_RE),
        ratio(LATIN_RE),
        ratio(DIGIT_RE),
        ratio(WHITESPACE_RE),
        entropy(points),
        new Set(points).size / length,
        compressed / Math.max(Buffer.byteLength(message, 'utf8'), 1),
    ];
}

function centroid(rows) {
    return rows[0].map((_, index) => (
        rows.reduce((sum, row) => sum + row[index], 0) / rows.length
    ));
}

function train(samples) {
    const normalRows = samples.filter(sample => sample.label === 0).map(sample => features(sample.message));
    const protectedRows = samples.filter(sample => sample.label === 1).map(sample => features(sample.message));
    const normalCenter = centroid(normalRows);
    const protectedCenter = centroid(protectedRows);
    const allRows = [...normalRows, ...protectedRows];
    const scales = normalCenter.map((_, index) => {
        const mean = allRows.reduce((sum, row) => sum + row[index], 0) / allRows.length;
        const variance = allRows.reduce((sum, row) => sum + ((row[index] - mean) ** 2), 0) / allRows.length;
        return Math.max(Math.sqrt(variance), 0.05);
    });

    return { normalCenter, protectedCenter, scales };
}

function squaredDistance(row, center, scales) {
    return row.reduce((sum, value, index) => (
        sum + (((value - center[index]) / scales[index]) ** 2)
    ), 0);
}

function score({ message, model }) {
    const row = features(message);
    const normalDistance = squaredDistance(row, model.normalCenter, model.scales);
    const protectedDistance = squaredDistance(row, model.protectedCenter, model.scales);
    const logit = Math.max(-20, Math.min(20, (normalDistance - protectedDistance) / 4));
    return 1 / (1 + Math.exp(-logit));
}

module.exports = {
    name: 'statistical-centroid-baseline',
    train,
    score,
};
