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
define(["require", "exports"], function (require, exports) {
    var XHTML_NS = "http://www.w3.org/1999/xhtml";
    function getDocumentHead(doc) {
        if (doc === void 0) { doc = document; }
        return (doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement);
    }
    exports.getDocumentHead = getDocumentHead;
    function getDocumentBody(doc) {
        if (doc === void 0) { doc = document; }
        return (doc.body || doc.getElementsByTagName("body")[0]);
    }
    exports.getDocumentBody = getDocumentBody;
    function createElement(tagName, namespaceURI) {
        return document.createElementNS ?
            document.createElementNS(namespaceURI || XHTML_NS, tagName) :
            document.createElement(tagName);
    }
    exports.createElement = createElement;
    function hasCssClass(element, name) {
        var classes = element.className.split(/\s+/g);
        return classes.indexOf(name) !== -1;
    }
    exports.hasCssClass = hasCssClass;
    /**
     * Add a CSS class to the list of classes on the given node
     */
    function addCssClass(element, name) {
        if (!hasCssClass(element, name)) {
            element.className += " " + name;
        }
    }
    exports.addCssClass = addCssClass;
    /**
     * Remove a CSS class from the list of classes on the given node
     */
    function removeCssClass(element, name) {
        var classes = element.className.split(/\s+/g);
        while (true) {
            var index = classes.indexOf(name);
            if (index === -1) {
                break;
            }
            classes.splice(index, 1);
        }
        element.className = classes.join(" ");
    }
    exports.removeCssClass = removeCssClass;
    function toggleCssClass(element, name) {
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
    exports.toggleCssClass = toggleCssClass;
    /*
     * Add or remove a CSS class from the list of classes on the given node
     * depending on the value of <tt>include</tt>
     */
    function setCssClass(node, className, include) {
        if (include) {
            addCssClass(node, className);
        }
        else {
            removeCssClass(node, className);
        }
    }
    exports.setCssClass = setCssClass;
    function hasCssString(id, doc) {
        if (doc === void 0) { doc = document; }
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
    exports.hasCssString = hasCssString;
    function importCssString(cssText, id, doc) {
        if (doc === void 0) { doc = document; }
        // If style is already imported return immediately.
        if (id && hasCssString(id, doc)) {
            return;
        }
        else {
            var style = createElement('style');
            style.appendChild(doc.createTextNode(cssText));
            if (id) {
                style.id = id;
            }
            getDocumentHead(doc).appendChild(style);
        }
    }
    exports.importCssString = importCssString;
    function importCssStylsheet(href, doc) {
        var link = createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        getDocumentHead(doc).appendChild(link);
    }
    exports.importCssStylsheet = importCssStylsheet;
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
    // FIXME: I don't like this because we lose type safety.
    function makeComputedStyle() {
        if (window.getComputedStyle) {
            // You can also call getPropertyValue!
            return function (element, style) {
                return (window.getComputedStyle(element, "") || {})[style] || "";
            };
        }
        else {
            return function (element, style) {
                if (style) {
                    return element['currentStyle'][style];
                }
                return element['currentStyle'];
            };
        }
    }
    exports.computedStyle = makeComputedStyle();
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
    function scrollbarWidth(document) {
        var inner = createElement("ace_inner");
        inner.style.width = "100%";
        inner.style.minWidth = "0px";
        inner.style.height = "200px";
        inner.style.display = "block";
        var outer = createElement("ace_outer");
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
    exports.scrollbarWidth = scrollbarWidth;
    /*
     * Optimized set innerHTML. This is faster than plain innerHTML if the element
     * already contains a lot of child elements.
     *
     * See http://blog.stevenlevithan.com/archives/faster-than-innerhtml for details
     */
    function setInnerHtml(element, innerHTML) {
        var clonedElement = element.cloneNode(false);
        clonedElement.innerHTML = innerHTML;
        element.parentNode.replaceChild(clonedElement, element);
        return clonedElement;
    }
    exports.setInnerHtml = setInnerHtml;
    function makeGetInnerText() {
        if ("textContent" in document.documentElement) {
            return function (el) {
                return el.textContent;
            };
        }
        else {
            return function (el) {
                return el.innerText;
            };
        }
    }
    function makeSetInnerText() {
        if ("textContent" in document.documentElement) {
            return function (el, innerText) {
                el.textContent = innerText;
            };
        }
        else {
            return function (el, innerText) {
                el.innerText = innerText;
            };
        }
    }
    exports.getInnerText = makeGetInnerText();
    exports.setInnerText = makeSetInnerText();
    function getParentWindow(document) {
        // This is a bit redundant now that parentWindow has been removed.
        return document.defaultView;
    }
    exports.getParentWindow = getParentWindow;
});
