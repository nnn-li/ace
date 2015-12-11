define(["require", "exports"], function (require, exports) {
    function each(obj, callback) {
        if (!obj) {
            return;
        }
        var keys = Object.keys(obj);
        for (var i = 0, iLength = keys.length; i < iLength; i++) {
            var key = keys[i];
            var value = obj[key];
            callback(value, key);
        }
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = each;
});
