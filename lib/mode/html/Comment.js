import Node from './Node';
import NodeType from './NodeType';
export default class Comment extends Node {
    constructor(locator, data) {
        super(locator);
        this.data = data;
        this.nodeType = NodeType.COMMENT;
    }
    visit(treeParser) {
        treeParser.comment(this.data, 0, this.data.length, this);
    }
}
