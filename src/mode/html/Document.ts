import ParentNode from './ParentNode';
import NodeType from './NodeType';

export default class Document extends ParentNode {
    nodeType: number;
    /**
     * A document.
     * @version $Id$
     * @author hsivonen
     */
    constructor(locator) {
        super(locator);
        this.nodeType = NodeType.DOCUMENT;
    }

    /**
     * 
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser) {
        treeParser.startDocument(this);
    }

    /**
     * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
     */
    revisit(treeParser) {
        treeParser.endDocument(this.endLocator);
    }
}

