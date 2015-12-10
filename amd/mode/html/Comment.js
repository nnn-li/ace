var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './Node', './NodeType'], function (require, exports, Node_1, NodeType_1) {
    /**
     * A comment.
     *
     * @version $Id$
     * @author hsivonen
     */
    var Comment = (function (_super) {
        __extends(Comment, _super);
        /**
         * The constructor.
         * @param locator the locator
         * @param buf the buffer
         * @param start the offset
         * @param length the length
         */
        function Comment(locator, data) {
            _super.call(this, locator);
            this.data = data;
            this.nodeType = NodeType_1.default.COMMENT;
        }
        /**
         *
         * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
         */
        Comment.prototype.visit = function (treeParser) {
            treeParser.comment(this.data, 0, this.data.length, this);
        };
        return Comment;
    })(Node_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Comment;
});
