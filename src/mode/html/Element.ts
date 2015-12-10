import ParentNode from './ParentNode';
import NodeType from './NodeType';

export default class Element extends ParentNode {
    uri;
    localName;
    qName;
    attributes;
    prefixMappings;
    nodeType;
    /**
     * An element.
     * @version $Id$
     * @author hsivonen
     */
    constructor(locator, uri, localName, qName, atts, prefixMappings?) {
        super(locator);
        this.uri = uri;
        this.localName = localName;
        this.qName = qName;
        this.attributes = atts;
        this.prefixMappings = prefixMappings;
        this.nodeType = NodeType.ELEMENT;
    }

    /**
     * 
     * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
     */
    visit(treeParser) {
        if (this.prefixMappings) {
            for (var key in this.prefixMappings) {
                var mapping = this.prefixMappings[key];
                treeParser.startPrefixMapping(mapping.getPrefix(),
                    mapping.getUri(), this);
            }
        }
        treeParser.startElement(this.uri, this.localName, this.qName, this.attributes, this);
    }

    /**
     * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
     */
    revisit(treeParser) {
        treeParser.endElement(this.uri, this.localName, this.qName, this.endLocator);
        if (this.prefixMappings) {
            for (var key in this.prefixMappings) {
                var mapping = this.prefixMappings[key];
                treeParser.endPrefixMapping(mapping.getPrefix(), this.endLocator);
            }
        }
    }
}

