define(["require", "exports"], function (require, exports) {
    function extend(obj, x) {
        var keys = Object.keys(x);
        for (var i = 0, iLength = keys.length; i < iLength; i++) {
            var key = keys[i];
            var prop = x[key];
            obj[key] = prop;
        }
        return obj;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = extend;
});
