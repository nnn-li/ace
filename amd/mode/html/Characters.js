var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './Node', './NodeType'], function (require, exports, Node_1, NodeType_1) {
    var Characters = (function (_super) {
        __extends(Characters, _super);
        /**
         * The constructor.
         * @param locator the locator
         * @param {String} data the buffer
         */
        function Characters(locator, data) {
            _super.call(this, locator);
            this.data = data;
            this.nodeType = NodeType_1.default.CHARACTERS;
        }
        /**
         *
         * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
         */
        Characters.prototype.visit = function (treeParser) {
            treeParser.characters(this.data, 0, this.data.length, this);
        };
        return Characters;
    })(Node_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Characters;
});
