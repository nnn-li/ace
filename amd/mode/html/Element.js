var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './ParentNode', './NodeType'], function (require, exports, ParentNode_1, NodeType_1) {
    var Element = (function (_super) {
        __extends(Element, _super);
        /**
         * An element.
         * @version $Id$
         * @author hsivonen
         */
        function Element(locator, uri, localName, qName, atts, prefixMappings) {
            _super.call(this, locator);
            this.uri = uri;
            this.localName = localName;
            this.qName = qName;
            this.attributes = atts;
            this.prefixMappings = prefixMappings;
            this.nodeType = NodeType_1.default.ELEMENT;
        }
        /**
         *
         * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
         */
        Element.prototype.visit = function (treeParser) {
            if (this.prefixMappings) {
                for (var key in this.prefixMappings) {
                    var mapping = this.prefixMappings[key];
                    treeParser.startPrefixMapping(mapping.getPrefix(), mapping.getUri(), this);
                }
            }
            treeParser.startElement(this.uri, this.localName, this.qName, this.attributes, this);
        };
        /**
         * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
         */
        Element.prototype.revisit = function (treeParser) {
            treeParser.endElement(this.uri, this.localName, this.qName, this.endLocator);
            if (this.prefixMappings) {
                for (var key in this.prefixMappings) {
                    var mapping = this.prefixMappings[key];
                    treeParser.endPrefixMapping(mapping.getPrefix(), this.endLocator);
                }
            }
        };
        return Element;
    })(ParentNode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Element;
});
