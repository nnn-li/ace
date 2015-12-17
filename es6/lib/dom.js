var XHTML_NS = "http://www.w3.org/1999/xhtml";
export function getDocumentHead(doc = document) {
    return (doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement);
}
export function getDocumentBody(doc = document) {
    return (doc.body || doc.getElementsByTagName("body")[0]);
}
export function createElement(tagName, namespaceURI) {
    return document.createElementNS ?
        document.createElementNS(namespaceURI || XHTML_NS, tagName) :
        document.createElement(tagName);
}
export function hasCssClass(element, name) {
    var classes = element.className.split(/\s+/g);
    return classes.indexOf(name) !== -1;
}
export function addCssClass(element, name) {
    if (!hasCssClass(element, name)) {
        element.className += " " + name;
    }
}
export function removeCssClass(element, name) {
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
export function toggleCssClass(element, name) {
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
export function setCssClass(node, className, include) {
    if (include) {
        addCssClass(node, className);
    }
    else {
        removeCssClass(node, className);
    }
}
export function hasCssString(id, doc = document) {
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
export function ensureHTMLStyleElement(cssText, id, doc = document) {
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
export function appendHTMLLinkElement(id, rel, type, href, doc = document) {
    var link = createElement('link');
    link.id = id;
    link.rel = rel;
    if (typeof type === 'string') {
        link.type = type;
    }
    link.href = href;
    getDocumentHead(doc).appendChild(link);
}
function makeComputedStyle() {
    if (window.getComputedStyle) {
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
export var computedStyle = makeComputedStyle();
export function scrollbarWidth(document) {
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
export function setInnerHtml(element, innerHTML) {
    var clonedElement = element.cloneNode(false);
    clonedElement.innerHTML = innerHTML;
    element.parentNode.replaceChild(clonedElement, element);
    return clonedElement;
}
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
export var getInnerText = makeGetInnerText();
export var setInnerText = makeSetInnerText();
export function getParentWindow(document) {
    return document.defaultView;
}
