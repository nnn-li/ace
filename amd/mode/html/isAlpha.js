define(["require", "exports"], function (require, exports) {
    function isAlpha(c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isAlpha;
});
