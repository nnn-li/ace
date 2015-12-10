import ParentNode from './ParentNode';
export default class DTD extends ParentNode {
    name: any;
    publicIdentifier: any;
    systemIdentifier: any;
    nodeType: number;
    /**
     * The constructor.
     * @param locator the locator
     * @param name the name
     * @param publicIdentifier the public id
     * @param systemIdentifier the system id
     */
    constructor(locator: any, name: any, publicIdentifier: any, systemIdentifier: any);
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
