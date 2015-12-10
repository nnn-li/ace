define(["require", "exports"], function (require, exports) {
    function comparePoints(p1, p2) {
        return p1.row - p2.row || p1.column - p2.column;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = comparePoints;
    ;
});
