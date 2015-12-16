import Node from './Node';
export default class ParentNode extends Node {
    constructor(locator) {
        super(locator);
        this.lastChild = null;
        this._endLocator = null;
    }
    insertBefore(child, sibling) {
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
    }
    insertBetween(child, prev, next) {
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
    }
    appendChild(child) {
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
    }
    appendChildren(parent) {
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
    }
    removeChild(node) {
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
    }
    get endLocator() {
        return this._endLocator;
    }
    set endLocator(endLocator) {
        this._endLocator = {
            lineNumber: endLocator.lineNumber,
            columnNumber: endLocator.columnNumber
        };
    }
}
