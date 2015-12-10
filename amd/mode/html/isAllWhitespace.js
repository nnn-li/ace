define(["require", "exports", './isWhitespace'], function (require, exports, isWhitespace_1) {
    function isAllWhitespace(characters) {
        for (var i = 0; i < characters.length; i++) {
            var ch = characters[i];
            if (!isWhitespace_1.default(ch))
                return false;
        }
        return true;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isAllWhitespace;
});
