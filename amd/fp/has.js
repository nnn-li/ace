define(["require", "exports"], function (require, exports) {
    function has(obj, v) {
        if (typeof v !== 'string') {
            throw new Error("has(obj, v): v must be a string");
        }
        if (obj && obj.hasOwnProperty) {
            return obj.hasOwnProperty(v);
        }
        else {
            return false;
        }
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = has;
});
