import Node from './Node';
export default class Characters extends Node {
    data: any;
    nodeType: any;
    /**
     * The constructor.
     * @param locator the locator
     * @param {String} data the buffer
     */
    constructor(locator: any, data: any);
    /**
     *
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser: any): void;
}
