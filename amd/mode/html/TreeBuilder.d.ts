import Modes from './Modes';
/**
 *
 */
export default class TreeBuilder {
    activeFormattingElements: any;
    compatMode: string;
    context: string;
    document: any;
    errorHandler: any;
    form: any;
    framesetOk: boolean;
    head: any;
    inQuirksMode: boolean;
    insertionMode: any;
    insertionModeName: any;
    insertionModes: Modes;
    openElements: any;
    originalInsertionMode: any;
    pendingTableCharacters: any;
    redirectAttachToFosterParent: boolean;
    tokenizer: any;
    selfClosingFlagAcknowledged: boolean;
    scriptingEnabled: boolean;
    shouldSkipLeadingNewline: any;
    /**
     *
     */
    constructor();
    setInsertionMode(name: any): void;
    /**
     * Adoption agency algorithm (http://www.whatwg.org/specs/web-apps/current-work/multipage/tree-construction.html#adoption-agency-algorithm)
     * @param {String} name A tag name subject for which the algorithm is being run
     * @return {Boolean} Returns false if the algorithm was aborted
     */
    adoptionAgencyEndTag(name: any): boolean;
    start(tokenizer: any): void;
    startTokenization(tokenizer: any): void;
    processToken(token: any): void;
    /**
     *
     * @return {Boolean}
     */
    isCdataSectionAllowed(): any;
    /**
     *
     * @return {Boolean}
     */
    isSelfClosingFlagAcknowledged(): boolean;
    createElement(namespaceURI: any, localName: any, attributes: any): void;
    attachNode(child: any, parent: any): void;
    attachNodeToFosterParent(child: any, table: any, stackParent: any): void;
    detachFromParent(node: any): void;
    addAttributesToElement(element: any, attributes: any): void;
    insertHtmlElement(attributes?: any): void;
    insertHeadElement(attributes: any): void;
    insertBodyElement(attributes: any): void;
    insertIntoFosterParent(node: any): void;
    insertElement(name: any, attributes: any, namespaceURI?: any, selfClosing?: any): void;
    insertFormattingElement(name: any, attributes: any): void;
    insertSelfClosingElement(name: any, attributes: any): void;
    insertForeignElement(name: any, attributes: any, namespaceURI: any, selfClosing: any): void;
    insertComment(data: any, parent: any): void;
    insertDoctype(name: any, publicId: any, systemId: any): void;
    insertText(data: any): void;
    /**
     * Returns topmost open element
     * @return {StackItem}
     */
    currentStackItem(): any;
    /**
     * Populates current open element
     * @return {StackItem}
     */
    popElement(): any;
    /**
     * Returns true if redirect is required and current open element causes foster parenting
     * @return {Boolean}
     */
    shouldFosterParent(): any;
    /**
     * Implements http://www.whatwg.org/specs/web-apps/current-work/multipage/tree-construction.html#closing-elements-that-have-implied-end-tags
     * @param {String} [exclude] Ignore specific tag name
     */
    generateImpliedEndTags(exclude?: any): void;
    /**
     * Performs http://www.whatwg.org/specs/web-apps/current-work/multipage/parsing.html#reconstruct-the-active-formatting-elements
     */
    reconstructActiveFormattingElements(): void;
    /**
     *
     * @param {StackItem} item
     */
    ensureNoahsArkCondition(item: any): void;
    /**
     *
     * @param {StackItem} item
     */
    appendElementToActiveFormattingElements(item: any): void;
    /**
     *
     * @param {StackItem} item
     */
    removeElementFromActiveFormattingElements(item: any): void;
    elementInActiveFormattingElements(name: any): any;
    clearActiveFormattingElements(): void;
    reparentChildren(oldParent: any, newParent: any): void;
    /**
     *
     * @param {String} context A context element name for fragment parsing
     */
    setFragmentContext(context: string): void;
    /**
     *
     * @param {String} code
     * @param {Object} [args]
     */
    parseError(code: any, args?: any): void;
    /**
     * Resets the insertion mode (http://www.whatwg.org/specs/web-apps/current-work/multipage/parsing.html#reset-the-insertion-mode-appropriately)
     */
    resetInsertionMode(): void;
    processGenericRCDATAStartTag(name: any, attributes: any): void;
    processGenericRawTextStartTag(name: any, attributes: any): void;
    adjustMathMLAttributes(attributes: any): any;
    adjustSVGTagNameCase(name: any): any;
    adjustSVGAttributes(attributes: any): any;
    adjustForeignAttributes(attributes: any): any;
}
