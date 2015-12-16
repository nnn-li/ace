/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
function isScopeMarker(node) {
  if (node.namespaceURI === "http://www.w3.org/1999/xhtml") {
    return node.localName === "applet"
      || node.localName === "caption"
      || node.localName === "marquee"
      || node.localName === "object"
      || node.localName === "table"
      || node.localName === "td"
      || node.localName === "th";
  }
  if (node.namespaceURI === "http://www.w3.org/1998/Math/MathML") {
    return node.localName === "mi"
      || node.localName === "mo"
      || node.localName === "mn"
      || node.localName === "ms"
      || node.localName === "mtext"
      || node.localName === "annotation-xml";
  }
  if (node.namespaceURI === "http://www.w3.org/2000/svg") {
    return node.localName === "foreignObject"
      || node.localName === "desc"
      || node.localName === "title";
  }
}

function isListItemScopeMarker(node) {
  return isScopeMarker(node)
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'ol')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'ul');
}

function isTableScopeMarker(node) {
  return (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'table')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'html');
}

function isTableBodyScopeMarker(node) {
  return (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'tbody')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'tfoot')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'thead')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'html');
}

function isTableRowScopeMarker(node) {
  return (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'tr')
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'html');
}

function isButtonScopeMarker(node) {
  return isScopeMarker(node)
    || (node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'button');
}

function isSelectScopeMarker(node) {
  return !(node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'optgroup')
    && !(node.namespaceURI === "http://www.w3.org/1999/xhtml" && node.localName === 'option');
}
/**
 * Represents a stack of open elements
 * @constructor
 */
export default function ElementStack() {
  this.elements = [];
  this.rootNode = null;
  this.headElement = null;
  this.bodyElement = null;
}

/**
 *
 * @param {String} localName
 * @param {Function} isMarker
 * @return {Boolean}
 * @private
 */
ElementStack.prototype._inScope = function(localName, isMarker) {
  for (var i = this.elements.length - 1; i >= 0; i--) {
    var node = this.elements[i];
    if (node.localName === localName)
      return true;
    if (isMarker(node))
      return false;
  }
};

/**
 * Pushes the item on the stack top
 * @param {StackItem} item
 */
ElementStack.prototype.push = function(item) {
  this.elements.push(item);
};

/**
 * Pushes the item on the stack top
 * @param {StackItem} item HTML element stack item
 */
ElementStack.prototype.pushHtmlElement = function(item) {
  this.rootNode = item.node;
  this.push(item);
};

/**
 * Pushes the item on the stack top
 * @param {StackItem} item HEAD element stack item
 */
ElementStack.prototype.pushHeadElement = function(item) {
  this.headElement = item.node;
  this.push(item);
};

/**
 * Pushes the item on the stack top
 * @param {StackItem} item BODY element stack item
 */
ElementStack.prototype.pushBodyElement = function(item) {
  this.bodyElement = item.node;
  this.push(item);
};

/**
 * Pops the topmost item
 * @return {StackItem}
 */
ElementStack.prototype.pop = function() {
  return this.elements.pop();
};

/**
 * Removes the item from the element stack
 * @param {StackItem} item The item to remove
 */
ElementStack.prototype.remove = function(item) {
  this.elements.splice(this.elements.indexOf(item), 1);
};

/**
 * Pops until an element with a given localName is popped
 * @param {String} localName
 */
ElementStack.prototype.popUntilPopped = function(localName) {
  var element;
  do {
    element = this.pop();
  } while (element.localName != localName);
};

ElementStack.prototype.popUntilTableScopeMarker = function() {
  while (!isTableScopeMarker(this.top))
    this.pop();
};

ElementStack.prototype.popUntilTableBodyScopeMarker = function() {
  while (!isTableBodyScopeMarker(this.top))
    this.pop();
};

ElementStack.prototype.popUntilTableRowScopeMarker = function() {
  while (!isTableRowScopeMarker(this.top))
    this.pop();
};

/**
 *
 * @param {Number} index
 * @return {StackItem}
 */
ElementStack.prototype.item = function(index) {
  return this.elements[index];
};

/**
 *
 * @param {StackItem} element
 * @return {Boolean}
 */
ElementStack.prototype.contains = function(element) {
  return this.elements.indexOf(element) !== -1;
};

/**
 *
 * @param {String} localName
 * @return {Boolean}
 */
ElementStack.prototype.inScope = function(localName) {
  return this._inScope(localName, isScopeMarker);
};

/**
 *
 * @param {String} localName
 * @return {Boolean}
 */
ElementStack.prototype.inListItemScope = function(localName) {
  return this._inScope(localName, isListItemScopeMarker);
};

/**
 *
 * @param {String} localName
 * @return {Boolean}
 */
ElementStack.prototype.inTableScope = function(localName) {
  return this._inScope(localName, isTableScopeMarker);
};

/**
 *
 * @param {String} localName
 * @return {Boolean}
 */
ElementStack.prototype.inButtonScope = function(localName) {
  return this._inScope(localName, isButtonScopeMarker);
};

/**
 *
 * @param {String} localName
 * @return {Boolean}
 */
ElementStack.prototype.inSelectScope = function(localName) {
  return this._inScope(localName, isSelectScopeMarker);
};

/**
 *
 * @return {Boolean}
 */
ElementStack.prototype.hasNumberedHeaderElementInScope = function() {
  for (var i = this.elements.length - 1; i >= 0; i--) {
    var node = this.elements[i];
    if (node.isNumberedHeader())
      return true;
    if (isScopeMarker(node))
      return false;
  }
};

/**
 *
 * @param {Object} element
 * @return {StackItem}
 */
ElementStack.prototype.furthestBlockForFormattingElement = function(element) {
  var furthestBlock = null;
  for (var i = this.elements.length - 1; i >= 0; i--) {
    var node = this.elements[i];
    if (node.node === element)
      break;
    if (node.isSpecial())
      furthestBlock = node;
  }
    return furthestBlock;
};

/**
 *
 * @param {String} localName
 * @return {Number}
 */
ElementStack.prototype.findIndex = function(localName) {
  for (var i = this.elements.length - 1; i >= 0; i--) {
    if (this.elements[i].localName == localName)
      return i;
  }
    return -1;
};

ElementStack.prototype.remove_openElements_until = function(callback) {
  var finished = false;
  var element;
  while (!finished) {
    element = this.elements.pop();
    finished = callback(element);
  }
  return element;
};

Object.defineProperty(ElementStack.prototype, 'top', {
  get: function() {
    return this.elements[this.elements.length - 1];
  }
});

Object.defineProperty(ElementStack.prototype, 'length', {
  get: function() {
    return this.elements.length;
  }
});
