const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const EMOJI_ALPHABET = [
    '😀','😁','😂','🤣','😃','😄','😅','😆',
    '😉','😊','😋','😎','😍','😘','🥰','😗',
    '😙','😚','🙂','🤗','🤩','🤔','🤨','😐',
    '😑','😶','🙄','😏','😣','😥','😮','🤐',
    '😯','😪','😫','🥱','😴','😌','😛','😜',
    '😝','🤤','😒','😓','😔','😕','🙃','🤑',
    '😲','😡','🤬','😖','😞','😟','😤','😢',
    '😭','😦','😧','😨','😩','🤯','😬','😰',
];

function encode({ payload }) {
    const base64 = Buffer.from(payload).toString('base64').replace(/=+$/u, '');
    let output = '';
    for (const symbol of base64) {
        output += EMOJI_ALPHABET[BASE64_ALPHABET.indexOf(symbol)];
    }
    return output;
}

function decode({ message }) {
    let base64 = '';
    for (const symbol of Array.from(message)) {
        const index = EMOJI_ALPHABET.indexOf(symbol);
        if (index < 0) return null;
        base64 += BASE64_ALPHABET[index];
    }
    base64 += '='.repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(base64, 'base64');
}

module.exports = {
    name: 'markerless-emoji-baseline',
    encode,
    decode,
};
