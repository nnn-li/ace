import Node from './Node';
import NodeType from './NodeType';

export default class Characters extends Node {
    data;
    nodeType;
    /**
     * The constructor.
     * @param locator the locator
     * @param {String} data the buffer
     */
    constructor(locator, data) {
        super(locator);
        this.data = data;
        this.nodeType = NodeType.CHARACTERS;
    }
    /**
     * 
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser) {
        treeParser.characters(this.data, 0, this.data.length, this);
    }
}

