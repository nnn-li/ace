var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './lib/event_emitter', './lib/asserts'], function (require, exports, event_emitter_1, asserts_1) {
    /**
     *
     * Defines the floating pointer in the document. Whenever text is inserted or deleted before the cursor, the position of the cursor is updated.
     *
     * @class Anchor
     *
     * Creates a new `Anchor` and associates it with a document.
     *
     * @param {EditorDocument} doc The document to associate with the anchor
     * @param {Number} row The starting row position
     * @param {Number} column The starting column position
     *
     * @constructor
     **/
    var Anchor = (function (_super) {
        __extends(Anchor, _super);
        function Anchor(doc, row, column) {
            _super.call(this);
            asserts_1.assert(typeof row === 'number', "row must be a number");
            asserts_1.assert(typeof column === 'number', "column must be a number");
            this.$onChange = this.onChange.bind(this);
            this.attach(doc);
            this.setPosition(row, column);
            this.$insertRight = false;
        }
        /**
         * Returns an object identifying the `row` and `column` position of the current anchor.
         * @returns {Object}
         **/
        Anchor.prototype.getPosition = function () {
            return this.$clipPositionToDocument(this.row, this.column);
        };
        /**
         *
         * Returns the current document.
         * @returns {EditorDocument}
         **/
        Anchor.prototype.getDocument = function () {
            return this.document;
        };
        /**
         * Fires whenever the anchor position changes.
         *
         * Both of these objects have a `row` and `column` property corresponding to the position.
         *
         * Events that can trigger this function include [[Anchor.setPosition `setPosition()`]].
         *
         * @event change
         * @param {Object} e  An object containing information about the anchor position. It has two properties:
         *  - `old`: An object describing the old Anchor position
         *  - `value`: An object describing the new Anchor position
         *
         **/
        Anchor.prototype.onChange = function (e, doc) {
            var delta = e.data;
            var range = delta.range;
            if (range.start.row == range.end.row && range.start.row != this.row)
                return;
            if (range.start.row > this.row)
                return;
            if (range.start.row == this.row && range.start.column > this.column)
                return;
            var row = this.row;
            var column = this.column;
            var start = range.start;
            var end = range.end;
            if (delta.action === "insertText") {
                if (start.row === row && start.column <= column) {
                    if (start.column === column && this.$insertRight) {
                    }
                    else if (start.row === end.row) {
                        column += end.column - start.column;
                    }
                    else {
                        column -= start.column;
                        row += end.row - start.row;
                    }
                }
                else if (start.row !== end.row && start.row < row) {
                    row += end.row - start.row;
                }
            }
            else if (delta.action === "insertLines") {
                if (start.row === row && column === 0 && this.$insertRight) {
                }
                else if (start.row <= row) {
                    row += end.row - start.row;
                }
            }
            else if (delta.action === "removeText") {
                if (start.row === row && start.column < column) {
                    if (end.column >= column)
                        column = start.column;
                    else
                        column = Math.max(0, column - (end.column - start.column));
                }
                else if (start.row !== end.row && start.row < row) {
                    if (end.row === row)
                        column = Math.max(0, column - end.column) + start.column;
                    row -= (end.row - start.row);
                }
                else if (end.row === row) {
                    row -= end.row - start.row;
                    column = Math.max(0, column - end.column) + start.column;
                }
            }
            else if (delta.action == "removeLines") {
                if (start.row <= row) {
                    if (end.row <= row)
                        row -= end.row - start.row;
                    else {
                        row = start.row;
                        column = 0;
                    }
                }
            }
            this.setPosition(row, column, true);
        };
        /**
         * Sets the anchor position to the specified row and column. If `noClip` is `true`, the position is not clipped.
         * @param {Number} row The row index to move the anchor to
         * @param {Number} column The column index to move the anchor to
         * @param {Boolean} noClip Identifies if you want the position to be clipped
         *
         **/
        Anchor.prototype.setPosition = function (row, column, noClip) {
            var pos;
            if (noClip) {
                pos = {
                    row: row,
                    column: column
                };
            }
            else {
                pos = this.$clipPositionToDocument(row, column);
            }
            if (this.row === pos.row && this.column === pos.column) {
                return;
            }
            var old = {
                row: this.row,
                column: this.column
            };
            this.row = pos.row;
            this.column = pos.column;
            this._signal("change", {
                old: old,
                value: pos
            });
        };
        /**
         * When called, the `'change'` event listener is removed.
         *
         **/
        Anchor.prototype.detach = function () {
            this.document.off("change", this.$onChange);
        };
        Anchor.prototype.attach = function (doc) {
            this.document = doc || this.document;
            this.document.on("change", this.$onChange);
        };
        /**
         * Clips the anchor position to the specified row and column.
         * @param {Number} row The row index to clip the anchor to
         * @param {Number} column The column index to clip the anchor to
         *
         **/
        Anchor.prototype.$clipPositionToDocument = function (row, column) {
            var pos = { row: 0, column: 0 };
            if (row >= this.document.getLength()) {
                pos.row = Math.max(0, this.document.getLength() - 1);
                pos.column = this.document.getLine(pos.row).length;
            }
            else if (row < 0) {
                pos.row = 0;
                pos.column = 0;
            }
            else {
                pos.row = row;
                pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
            }
            if (column < 0)
                pos.column = 0;
            return pos;
        };
        return Anchor;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Anchor;
});
