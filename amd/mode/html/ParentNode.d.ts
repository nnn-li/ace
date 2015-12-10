import Node from './Node';
export default class ParentNode extends Node {
    lastChild: any;
    _endLocator: any;
    constructor(locator: any);
    /**
     * Insert a new child before a pre-existing child and return the newly inserted child.
     * @param child the new child
     * @param sibling the existing child before which to insert (must be a child of this node) or <code>null</code> to append
     * @return <code>child</code>
     */
    insertBefore(child: any, sibling: any): any;
    insertBetween(child: any, prev: any, next: any): any;
    /**
     * Append a child to this node and return the child.
     *
     * @param child the child to append.
     * @return <code>child</code>
     */
    appendChild(child: any): any;
    /**
     * Append the children of another node to this node removing them from the other node .
     * @param parent the other node whose children to append to this one
     */
    appendChildren(parent: any): void;
    /**
     * Remove a child from this node.
     * @param node the child to remove
     */
    removeChild(node: any): any;
    endLocator: any;
}
