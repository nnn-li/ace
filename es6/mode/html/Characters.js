import Node from './Node';
import NodeType from './NodeType';
export default class Characters extends Node {
    constructor(locator, data) {
        super(locator);
        this.data = data;
        this.nodeType = NodeType.CHARACTERS;
    }
    visit(treeParser) {
        treeParser.characters(this.data, 0, this.data.length, this);
    }
}
