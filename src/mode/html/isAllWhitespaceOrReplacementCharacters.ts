import isWhitespaceOrReplacementCharacter from './isWhitespaceOrReplacementCharacter';

export default function isAllWhitespaceOrReplacementCharacters(characters: string): boolean {
    for (var i = 0; i < characters.length; i++) {
        var ch = characters[i];
        if (!isWhitespaceOrReplacementCharacter(ch))
            return false;
    }
    return true;
}
