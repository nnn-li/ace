var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./Range"], function (require, exports, Range_1) {
    var OrientedRange = (function (_super) {
        __extends(OrientedRange, _super);
        function OrientedRange(startRow, startColumn, endRow, endColumn, cursor, desiredColumn) {
            _super.call(this, startRow, startColumn, endRow, endColumn);
            this.cursor = cursor;
            this.desiredColumn = desiredColumn;
        }
        return OrientedRange;
    })(Range_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = OrientedRange;
});
