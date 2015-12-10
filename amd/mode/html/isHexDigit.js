define(["require", "exports"], function (require, exports) {
    function isHexDigit(c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = isHexDigit;
});
