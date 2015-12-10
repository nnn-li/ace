define(["require", "exports", './isWhitespaceOrReplacementCharacter'], function (require, exports, isWhitespaceOrReplacementCharacter_1) {
    function isAllWhitespaceOrReplacementCharacters(characters) {
        for (var i = 0; i < characters.length; i++) {
            var ch = characters[i];
            if (!isWhitespaceOrReplacementCharacter_1.default(ch))
                return false;
        }
        return true;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isAllWhitespaceOrReplacementCharacters;
});
