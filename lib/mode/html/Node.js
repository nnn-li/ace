export default class Node {
    constructor(locator) {
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
    visit(treeParser) {
        throw new Error("Not Implemented");
    }
    revisit(treeParser) {
        return;
    }
    detach() {
        if (this.parentNode !== null) {
            this.parentNode.removeChild(this);
            this.parentNode = null;
        }
    }
    get previousSibling() {
        var prev = null;
        var next = this.parentNode.firstChild;
        for (;;) {
            if (this == next) {
                return prev;
            }
            prev = next;
            next = next.nextSibling;
        }
    }
}
