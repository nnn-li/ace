define(["require", "exports"], function (require, exports) {
    var Node = (function () {
        /**
         * The common node superclass.
         * @version $Id$
         * @author hsivonen
         */
        function Node(locator) {
            if (!locator) {
                this.columnNumber = -1;
                this.lineNumber = -1;
            }
            else {
                this.columnNumber = locator.columnNumber;
                this.lineNumber = locator.lineNumber;
            }
            this.parentNode = null;
            this.nextSibling = null;
            this.firstChild = null;
        }
        /**
         * Visit the node.
         *
         * @param treeParser the visitor
         * @throws SAXException if stuff goes wrong
         */
        Node.prototype.visit = function (treeParser) {
            throw new Error("Not Implemented");
        };
        /**
         * Revisit the node.
         *
         * @param treeParser the visitor
         * @throws SAXException if stuff goes wrong
         */
        Node.prototype.revisit = function (treeParser) {
            return;
        };
        // Subclass-specific accessors that are hoisted here to 
        // avoid casting.
        /**
         * Detach this node from its parent.
         */
        Node.prototype.detach = function () {
            if (this.parentNode !== null) {
                this.parentNode.removeChild(this);
                this.parentNode = null;
            }
        };
        Object.defineProperty(Node.prototype, "previousSibling", {
            get: function () {
                var prev = null;
                var next = this.parentNode.firstChild;
                for (;;) {
                    if (this == next) {
                        return prev;
                    }
                    prev = next;
                    next = next.nextSibling;
                }
            },
            enumerable: true,
            configurable: true
        });
        return Node;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Node;
});
