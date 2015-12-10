var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './TreeBuilder', './Characters', './Comment', './Document', './DTD', './Element', './getAttribute'], function (require, exports, TreeBuilder_1, Characters_1, Comment_1, Document_1, DTD_1, Element_1, getAttribute_1) {
    var SAXTreeBuilder = (function (_super) {
        __extends(SAXTreeBuilder, _super);
        function SAXTreeBuilder() {
            _super.call(this);
        }
        SAXTreeBuilder.prototype.start = function (tokenizer) {
            this.document = new Document_1.default(this.tokenizer);
        };
        SAXTreeBuilder.prototype.end = function () {
            this.document.endLocator = this.tokenizer;
        };
        SAXTreeBuilder.prototype.insertDoctype = function (name, publicId, systemId) {
            var doctype = new DTD_1.default(this.tokenizer, name, publicId, systemId);
            doctype.endLocator = this.tokenizer;
            this.document.appendChild(doctype);
        };
        SAXTreeBuilder.prototype.createElement = function (namespaceURI, localName, attributes) {
            var element = new Element_1.default(this.tokenizer, namespaceURI, localName, localName, attributes || []);
            return element;
        };
        SAXTreeBuilder.prototype.insertComment = function (data, parent) {
            if (!parent)
                parent = this.currentStackItem();
            var comment = new Comment_1.default(this.tokenizer, data);
            parent.appendChild(comment);
        };
        SAXTreeBuilder.prototype.appendCharacters = function (parent, data) {
            var text = new Characters_1.default(this.tokenizer, data);
            parent.appendChild(text);
        };
        SAXTreeBuilder.prototype.insertText = function (data) {
            if (this.redirectAttachToFosterParent && this.openElements.top.isFosterParenting()) {
                var tableIndex = this.openElements.findIndex('table');
                var tableItem = this.openElements.item(tableIndex);
                var table = tableItem.node;
                if (tableIndex === 0) {
                    return this.appendCharacters(table, data);
                }
                var text = new Characters_1.default(this.tokenizer, data);
                var parent = table.parentNode;
                if (parent) {
                    parent.insertBetween(text, table.previousSibling, table);
                    return;
                }
                var stackParent = this.openElements.item(tableIndex - 1).node;
                stackParent.appendChild(text);
                return;
            }
            this.appendCharacters(this.currentStackItem().node, data);
        };
        SAXTreeBuilder.prototype.attachNode = function (node, parent) {
            parent.appendChild(node);
        };
        SAXTreeBuilder.prototype.attachNodeToFosterParent = function (child, table, stackParent) {
            var parent = table.parentNode;
            if (parent)
                parent.insertBetween(child, table.previousSibling, table);
            else
                stackParent.appendChild(child);
        };
        SAXTreeBuilder.prototype.detachFromParent = function (element) {
            element.detach();
        };
        SAXTreeBuilder.prototype.reparentChildren = function (oldParent, newParent) {
            newParent.appendChildren(oldParent.firstChild);
        };
        SAXTreeBuilder.prototype.getFragment = function () {
            var fragment = new DocumentFragment();
            this.reparentChildren(this.openElements.rootNode, fragment);
            return fragment;
        };
        SAXTreeBuilder.prototype.addAttributesToElement = function (element, attributes) {
            for (var i = 0; i < attributes.length; i++) {
                var attribute = attributes[i];
                if (!getAttribute_1.default(element, attribute.nodeName))
                    element.attributes.push(attribute);
            }
        };
        return SAXTreeBuilder;
    })(TreeBuilder_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = SAXTreeBuilder;
});
