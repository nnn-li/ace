var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './ParentNode', './NodeType'], function (require, exports, ParentNode_1, NodeType_1) {
    var Document = (function (_super) {
        __extends(Document, _super);
        /**
         * A document.
         * @version $Id$
         * @author hsivonen
         */
        function Document(locator) {
            _super.call(this, locator);
            this.nodeType = NodeType_1.default.DOCUMENT;
        }
        /**
         *
         * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
         */
        Document.prototype.visit = function (treeParser) {
            treeParser.startDocument(this);
        };
        /**
         * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
         */
        Document.prototype.revisit = function (treeParser) {
            treeParser.endDocument(this.endLocator);
        };
        return Document;
    })(ParentNode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Document;
});
