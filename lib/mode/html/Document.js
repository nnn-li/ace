import ParentNode from './ParentNode';
import NodeType from './NodeType';
export default class Document extends ParentNode {
    constructor(locator) {
        super(locator);
        this.nodeType = NodeType.DOCUMENT;
    }
    visit(treeParser) {
        treeParser.startDocument(this);
    }
    revisit(treeParser) {
        treeParser.endDocument(this.endLocator);
    }
}
