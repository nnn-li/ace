import isWhitespace from './isWhitespace';
export default function isWhitespaceOrReplacementCharacter(ch) {
    return isWhitespace(ch) || ch === '\uFFFD';
}
