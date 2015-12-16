import isWhitespaceOrReplacementCharacter from './isWhitespaceOrReplacementCharacter';
export default function isAllWhitespaceOrReplacementCharacters(characters) {
    for (var i = 0; i < characters.length; i++) {
        var ch = characters[i];
        if (!isWhitespaceOrReplacementCharacter(ch))
            return false;
    }
    return true;
}
