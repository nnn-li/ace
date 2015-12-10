import TreeBuilder from './TreeBuilder';
import Element from './Element';
export default class SAXTreeBuilder extends TreeBuilder {
    constructor();
    start(tokenizer: any): void;
    end(): void;
    insertDoctype(name: any, publicId: any, systemId: any): void;
    createElement(namespaceURI: any, localName: any, attributes: any): Element;
    insertComment(data: any, parent: any): void;
    appendCharacters(parent: any, data: any): void;
    insertText(data: any): void;
    attachNode(node: any, parent: any): void;
    attachNodeToFosterParent(child: any, table: any, stackParent: any): void;
    detachFromParent(element: any): void;
    reparentChildren(oldParent: any, newParent: any): void;
    getFragment(): DocumentFragment;
    addAttributesToElement(element: any, attributes: any): void;
}
