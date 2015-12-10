export declare function getDocumentHead(doc?: Document): HTMLHeadElement;
export declare function getDocumentBody(doc?: Document): HTMLBodyElement;
export declare function createElement(tagName: string, namespaceURI?: string): Element;
export declare function hasCssClass(element: HTMLElement, name: string): boolean;
/**
 * Add a CSS class to the list of classes on the given node
 */
export declare function addCssClass(element: HTMLElement, name: string): void;
/**
 * Remove a CSS class from the list of classes on the given node
 */
export declare function removeCssClass(element: HTMLElement, name: string): void;
export declare function toggleCssClass(element: HTMLElement, name: string): boolean;
export declare function setCssClass(node: HTMLElement, className: string, include: boolean): void;
export declare function hasCssString(id: string, doc?: Document): boolean;
export declare function importCssString(cssText: string, id?: string, doc?: Document): void;
export declare function importCssStylsheet(href: string, doc?: Document): void;
export declare var computedStyle: (element: HTMLElement, style: string) => CSSStyleDeclaration;
export declare function scrollbarWidth(document: Document): number;
export declare function setInnerHtml(element: HTMLElement, innerHTML: string): HTMLElement;
export declare var getInnerText: (el: HTMLElement) => string;
export declare var setInnerText: (el: HTMLElement, innerText: string) => void;
export declare function getParentWindow(document: Document): Window;
