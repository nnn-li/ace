define(["require", "exports"], function (require, exports) {
    function findLastIndex(xs, callback) {
        for (var i = xs.length - 1; i >= 0; i--) {
            var x = xs[i];
            if (callback(x)) {
                return i;
            }
        }
        return -1;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = findLastIndex;
});
