import isWhitespace from './isWhitespace';
export default function isAllWhitespace(characters) {
    for (var i = 0; i < characters.length; i++) {
        var ch = characters[i];
        if (!isWhitespace(ch))
            return false;
    }
    return true;
}
