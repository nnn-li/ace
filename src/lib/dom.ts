/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

var XHTML_NS = "http://www.w3.org/1999/xhtml";

export function getDocumentHead(doc: Document = document): HTMLHeadElement {
    return <HTMLHeadElement>(doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement);
}

export function getDocumentBody(doc: Document = document): HTMLBodyElement {
    return <HTMLBodyElement>(doc.body || doc.getElementsByTagName("body")[0]);
}

export function createElement(tagName: string, namespaceURI?: string): Element {
    return document.createElementNS ?
        document.createElementNS(namespaceURI || XHTML_NS, tagName) :
        document.createElement(tagName);
}

export function hasCssClass(element: HTMLElement, name: string): boolean {
    var classes: string[] = element.className.split(/\s+/g);
    return classes.indexOf(name) !== -1;
}

/**
 * Add a CSS class to the list of classes on the given node
 */
export function addCssClass(element: HTMLElement, name: string): void {
    if (!hasCssClass(element, name)) {
        element.className += " " + name;
    }
}

/**
 * Remove a CSS class from the list of classes on the given node
 */
export function removeCssClass(element: HTMLElement, name: string): void {
    var classes: string[] = element.className.split(/\s+/g);
    while (true) {
        var index = classes.indexOf(name);
        if (index === -1) {
            break;
        }
        classes.splice(index, 1);
    }
    element.className = classes.join(" ");
}

export function toggleCssClass(element: HTMLElement, name: string): boolean {
    var classes = element.className.split(/\s+/g);
    var add = true;
    while (true) {
        var index = classes.indexOf(name);
        if (index == -1) {
            break;
        }
        add = false;
        classes.splice(index, 1);
    }
    if (add)
        classes.push(name);

    element.className = classes.join(" ");
    return add;
}

/*
 * Add or remove a CSS class from the list of classes on the given node
 * depending on the value of <tt>include</tt>
 */
export function setCssClass(node: HTMLElement, className: string, include: boolean): void {
    if (include) {
        addCssClass(node, className);
    }
    else {
        removeCssClass(node, className);
    }
}

export function hasCssString(id: string, doc: Document = document) {
    var index = 0;
    var sheets = doc.getElementsByTagName('style');

    if (sheets) {
        while (index < sheets.length) {
            if (sheets[index++].id === id) {
                return true;
            }
        }
    }
    return false;
}

export function importCssString(cssText: string, id?: string, doc: Document = document): void {
    // If style is already imported return immediately.
    if (id && hasCssString(id, doc)) {
        return;
    }
    else {
        let style = createElement('style');
        style.appendChild(doc.createTextNode(cssText));
        if (id) {
            style.id = id;
        }
        getDocumentHead(doc).appendChild(style);
    }
}

export function importCssStylsheet(href: string, doc?: Document) {
    var link = <HTMLLinkElement>createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    getDocumentHead(doc).appendChild(link);
}
/*
export function getInnerWidth(element: HTMLElement): number {
    return (
        parseInt(exports.computedStyle(element, "paddingLeft"), 10) +
        parseInt(exports.computedStyle(element, "paddingRight"), 10) +
        element.clientWidth
    );
}
*/
/*
export function getInnerHeight(element: HTMLElement): number {
    return (
        parseInt(exports.computedStyle(element, "paddingTop"), 10) +
        parseInt(exports.computedStyle(element, "paddingBottom"), 10) +
        element.clientHeight
    );
}
*/
/*
if (window.pageYOffset !== undefined) {
    exports.getPageScrollTop = function() {
        return window.pageYOffset;
    };

    exports.getPageScrollLeft = function() {
        return window.pageXOffset;
    };
}
else {
    exports.getPageScrollTop = function() {
        return document.body.scrollTop;
    };

    exports.getPageScrollLeft = function() {
        return document.body.scrollLeft;
    };
}
*/
function makeComputedStyle(): (element: HTMLElement, style?: string) => any {
    if (window.getComputedStyle) {
        return function(element: HTMLElement, style?: string): any {
            if (style) {
                return (window.getComputedStyle(element, "") || {})[style] || "";
            }
            return window.getComputedStyle(element, "") || {};
        };
    }
    else {
        return function(element: HTMLElement, style?: string): any {
            if (style) {
                return element['currentStyle'][style];
            }
            return element['currentStyle'];
        };
    }
}

export var computedStyle = makeComputedStyle();
// FIXME
/*
if (window.getComputedStyle)
    exports.computedStyle = function(element, style): any {
        if (style)
            return (window.getComputedStyle(element, "") || {})[style] || "";
        return window.getComputedStyle(element, "") || {};
    };
else
    exports.computedStyle = function(element, style) {
        if (style)
            return element.currentStyle[style];
        return element.currentStyle;
    };
*/
export function scrollbarWidth(document: Document): number {
    var inner: HTMLElement = <HTMLElement>createElement("ace_inner");
    inner.style.width = "100%";
    inner.style.minWidth = "0px";
    inner.style.height = "200px";
    inner.style.display = "block";

    var outer: HTMLElement = <HTMLElement>createElement("ace_outer");
    var style = outer.style;

    style.position = "absolute";
    style.left = "-10000px";
    style.overflow = "hidden";
    style.width = "200px";
    style.minWidth = "0px";
    style.height = "150px";
    style.display = "block";

    outer.appendChild(inner);

    var body = document.documentElement;
    body.appendChild(outer);

    var noScrollbar = inner.offsetWidth;

    style.overflow = "scroll";
    var withScrollbar = inner.offsetWidth;

    if (noScrollbar === withScrollbar) {
        withScrollbar = outer.clientWidth;
    }

    body.removeChild(outer);

    return noScrollbar - withScrollbar;
}

/*
 * Optimized set innerHTML. This is faster than plain innerHTML if the element
 * already contains a lot of child elements.
 *
 * See http://blog.stevenlevithan.com/archives/faster-than-innerhtml for details
 */
export function setInnerHtml(element: HTMLElement, innerHTML: string) {
    var clonedElement = <HTMLElement>element.cloneNode(false);
    clonedElement.innerHTML = innerHTML;
    element.parentNode.replaceChild(clonedElement, element);
    return clonedElement;
}

function makeGetInnerText(): (el: HTMLElement) => string {
    if ("textContent" in document.documentElement) {
        return function(el: HTMLElement) {
            return el.textContent;
        };
    }
    else {
        return function(el: HTMLElement) {
            return el.innerText;
        };
    }
}

function makeSetInnerText(): (el: HTMLElement, innerText: string) => void {
    if ("textContent" in document.documentElement) {
        return function(el: HTMLElement, innerText: string): void {
            el.textContent = innerText;
        };
    }
    else {
        return function(el: HTMLElement, innerText: string) {
            el.innerText = innerText;
        };
    }
}

export var getInnerText: (el: HTMLElement) => string = makeGetInnerText();
export var setInnerText: (el: HTMLElement, innerText: string) => void = makeSetInnerText();

export function getParentWindow(document: Document): Window {
    // This is a bit redundant now that parentWindow has been removed.
    return document.defaultView;
}
