var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './Node'], function (require, exports, Node_1) {
    var ParentNode = (function (_super) {
        __extends(ParentNode, _super);
        function ParentNode(locator) {
            _super.call(this, locator);
            this.lastChild = null;
            this._endLocator = null;
        }
        /**
         * Insert a new child before a pre-existing child and return the newly inserted child.
         * @param child the new child
         * @param sibling the existing child before which to insert (must be a child of this node) or <code>null</code> to append
         * @return <code>child</code>
         */
        ParentNode.prototype.insertBefore = function (child, sibling) {
            //assert sibling == null || this == sibling.getParentNode();
            if (!sibling) {
                return this.appendChild(child);
            }
            child.detach();
            child.parentNode = this;
            if (this.firstChild == sibling) {
                child.nextSibling = sibling;
                this.firstChild = child;
            }
            else {
                var prev = this.firstChild;
                var next = this.firstChild.nextSibling;
                while (next != sibling) {
                    prev = next;
                    next = next.nextSibling;
                }
                prev.nextSibling = child;
                child.nextSibling = next;
            }
            return child;
        };
        ParentNode.prototype.insertBetween = function (child, prev, next) {
            // assert prev == null || this == prev.getParentNode();
            // assert next == null || this == next.getParentNode();
            // assert prev != null || next == firstChild;
            // assert next != null || prev == lastChild;
            // assert prev == null || next == null || prev.getNextSibling() == next;
            if (!next) {
                return this.appendChild(child);
            }
            child.detach();
            child.parentNode = this;
            child.nextSibling = next;
            if (!prev) {
                this.firstChild = child;
            }
            else {
                prev.nextSibling = child;
            }
            return child;
        };
        /**
         * Append a child to this node and return the child.
         *
         * @param child the child to append.
         * @return <code>child</code>
         */
        ParentNode.prototype.appendChild = function (child) {
            child.detach();
            child.parentNode = this;
            if (!this.firstChild) {
                this.firstChild = child;
            }
            else {
                this.lastChild.nextSibling = child;
            }
            this.lastChild = child;
            return child;
        };
        /**
         * Append the children of another node to this node removing them from the other node .
         * @param parent the other node whose children to append to this one
         */
        ParentNode.prototype.appendChildren = function (parent) {
            var child = parent.firstChild;
            if (!child) {
                return;
            }
            var another = parent;
            if (!this.firstChild) {
                this.firstChild = child;
            }
            else {
                this.lastChild.nextSibling = child;
            }
            this.lastChild = another.lastChild;
            do {
                child.parentNode = this;
            } while ((child = child.nextSibling));
            another.firstChild = null;
            another.lastChild = null;
        };
        /**
         * Remove a child from this node.
         * @param node the child to remove
         */
        ParentNode.prototype.removeChild = function (node) {
            //assert this == node.getParentNode();
            if (this.firstChild == node) {
                this.firstChild = node.nextSibling;
                if (this.lastChild == node) {
                    this.lastChild = null;
                }
            }
            else {
                var prev = this.firstChild;
                var next = this.firstChild.nextSibling;
                while (next != node) {
                    prev = next;
                    next = next.nextSibling;
                }
                prev.nextSibling = node.nextSibling;
                if (this.lastChild == node) {
                    this.lastChild = prev;
                }
            }
            node.parentNode = null;
            return node;
        };
        Object.defineProperty(ParentNode.prototype, "endLocator", {
            get: function () {
                return this._endLocator;
            },
            set: function (endLocator) {
                this._endLocator = {
                    lineNumber: endLocator.lineNumber,
                    columnNumber: endLocator.columnNumber
                };
            },
            enumerable: true,
            configurable: true
        });
        return ParentNode;
    })(Node_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = ParentNode;
});
