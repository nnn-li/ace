export default class Node {
    columnNumber: number;
    lineNumber: number;
    parentNode: any;
    nextSibling: any;
    firstChild: any;
    /**
     * The common node superclass.
     * @version $Id$
     * @author hsivonen
     */
    constructor(locator: any);
    /**
     * Visit the node.
     *
     * @param treeParser the visitor
     * @throws SAXException if stuff goes wrong
     */
    visit(treeParser: any): void;
    /**
     * Revisit the node.
     *
     * @param treeParser the visitor
     * @throws SAXException if stuff goes wrong
     */
    revisit(treeParser: any): void;
    /**
     * Detach this node from its parent.
     */
    detach(): void;
    previousSibling: any;
}
