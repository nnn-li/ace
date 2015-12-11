define(["require", "exports"], function (require, exports) {
    function sliceArgs(args, start, end) {
        if (start === void 0) { start = 0; }
        if (end === void 0) { end = args.length; }
        var sliced = [];
        for (var i = start; i < end; i++) {
            sliced.push(args[i]);
        }
        return sliced;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = sliceArgs;
});
