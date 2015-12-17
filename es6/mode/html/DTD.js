import ParentNode from './ParentNode';
import NodeType from './NodeType';
export default class DTD extends ParentNode {
    constructor(locator, name, publicIdentifier, systemIdentifier) {
        super(locator);
        this.name = name;
        this.publicIdentifier = publicIdentifier;
        this.systemIdentifier = systemIdentifier;
        this.nodeType = NodeType.DTD;
    }
    visit(treeParser) {
        treeParser.startDTD(this.name, this.publicIdentifier, this.systemIdentifier, this);
    }
    revisit(treeParser) {
        treeParser.endDTD();
    }
}
