define(["require", "exports"], function (require, exports) {
    function isWhitespace(ch) {
        return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f";
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isWhitespace;
});
