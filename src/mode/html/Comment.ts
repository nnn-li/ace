import Node from './Node';
import NodeType from './NodeType';

/**
 * A comment.
 * 
 * @version $Id$
 * @author hsivonen
 */
export default class Comment extends Node {
    data;
    nodeType: number;
    /**
     * The constructor.
     * @param locator the locator
     * @param buf the buffer
     * @param start the offset
     * @param length the length
     */
    constructor(locator, data) {
        super(locator);
        this.data = data;
        this.nodeType = NodeType.COMMENT;
    }
    /**
     * 
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser) {
        treeParser.comment(this.data, 0, this.data.length, this);
    }
}
