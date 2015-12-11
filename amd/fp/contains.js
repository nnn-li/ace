define(["require", "exports"], function (require, exports) {
    function contains(xs, x) {
        for (var i = 0, iLength = xs.length; i < iLength; i++) {
            if (xs[i] === x) {
                return true;
            }
        }
        return false;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = contains;
});
