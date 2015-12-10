import ParentNode from './ParentNode';
export default class Document extends ParentNode {
    nodeType: number;
    /**
     * A document.
     * @version $Id$
     * @author hsivonen
     */
    constructor(locator: any);
    /**
     *
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser: any): void;
    /**
     * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
     */
    revisit(treeParser: any): void;
}
