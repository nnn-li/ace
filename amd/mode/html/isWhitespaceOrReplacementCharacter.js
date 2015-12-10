define(["require", "exports", './isWhitespace'], function (require, exports, isWhitespace_1) {
    function isWhitespaceOrReplacementCharacter(ch) {
        return isWhitespace_1.default(ch) || ch === '\uFFFD';
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isWhitespaceOrReplacementCharacter;
});
