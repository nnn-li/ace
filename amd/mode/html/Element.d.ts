import ParentNode from './ParentNode';
export default class Element extends ParentNode {
    uri: any;
    localName: any;
    qName: any;
    attributes: any;
    prefixMappings: any;
    nodeType: any;
    /**
     * An element.
     * @version $Id$
     * @author hsivonen
     */
    constructor(locator: any, uri: any, localName: any, qName: any, atts: any, prefixMappings?: any);
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
