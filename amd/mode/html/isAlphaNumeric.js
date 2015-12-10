define(["require", "exports"], function (require, exports) {
    function isAlphaNumeric(c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isAlphaNumeric;
});
