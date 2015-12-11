define(["require", "exports"], function (require, exports) {
    function clone(x) {
        var keys = Object.keys(x);
        var result = {};
        for (var i = 0, iLength = keys.length; i < iLength; i++) {
            var key = keys[i];
            var prop = x[key];
            result[key] = prop;
        }
        return result;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = clone;
});
