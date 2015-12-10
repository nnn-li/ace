import Node from './Node';
/**
 * A comment.
 *
 * @version $Id$
 * @author hsivonen
 */
export default class Comment extends Node {
    data: any;
    nodeType: number;
    /**
     * The constructor.
     * @param locator the locator
     * @param buf the buffer
     * @param start the offset
     * @param length the length
     */
    constructor(locator: any, data: any);
    /**
     *
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser: any): void;
}
