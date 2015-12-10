export declare var TEST_ELEMENT: HTMLDivElement;
/**
 * set a timeout with a given `this` scope.
 * @param {Function} fn
 * @param {Number} timeout
 * @param {Object} context
 * @return {number}
 */
export declare function setTimeoutContext(fn: any, timeout: number, context: any): number;
/**
 * if the argument is an array, we want to execute the fn on each entry
 * if it aint an array we don't want to do a thing.
 * this is used by all the methods that accept a single and array argument.
 * @param {*|Array} arg
 * @param {String} fn
 * @param {Object} [context]
 * @return {Boolean}
 */
export declare function invokeArrayArg(arg: any, fn: any, context: any): boolean;
/**
 * walk objects and arrays
 * @param {Object} obj
 * @param {Function} iterator
 * @param {Object} context
 */
export declare function each(obj: any, iterator: any, context?: any): void;
/**
 * extend object.
 * means that properties in dest will be overwritten by the ones in src.
 * @param {Object} dest
 * @param {Object} src
 * @param {Boolean} [merge]
 * @return {Object} dest
 */
export declare function extend(dest: any, src: any, merge?: boolean): any;
/**
 * merge the values from src in the dest.
 * means that properties that exist in dest will not be overwritten by src
 * @param {Object} dest
 * @param {Object} src
 * @return {Object} dest
 */
export declare function merge(dest: any, src: any): any;
/**
 * simple class inheritance
 * @param {Function} child
 * @param {Function} base
 * @param {Object} [properties]
 */
export declare function inherit(child: any, base: any, properties: any): void;
/**
 * simple function bind
 * @param {Function} fn
 * @param {Object} context
 * @return {Function}
 */
export declare function bindFn(fn: any, context: any): () => any;
/**
 * use the val2 when val1 is undefined
 * @param {*} val1
 * @param {*} val2
 * @return {*}
 */
export declare function ifUndefined(val1: any, val2: any): any;
/**
 * addEventListener with multiple events at once
 * @param {EventTarget} eventTarget
 * @param {String} types
 * @param {Function} handler
 */
export declare function addEventListeners(eventTarget: EventTarget, types: string, handler: any): void;
/**
 * removeEventListener with multiple events at once
 * @param {EventTarget} eventTarget
 * @param {String} types
 * @param {Function} handler
 */
export declare function removeEventListeners(eventTarget: EventTarget, types: string, handler: any): void;
/**
 * find if a node is in the given parent
 * @method hasParent
 * @param {HTMLElement} node
 * @param {HTMLElement} parent
 * @return {Boolean} found
 */
export declare function hasParent(node: any, parent: any): boolean;
/**
 * small indexOf wrapper
 * @param {String} str
 * @param {String} find
 * @return {Boolean} found
 */
export declare function inStr(str: string, find: string): boolean;
/**
 * split string on whitespace
 * @param {String} str
 * @return {Array} words
 */
export declare function splitStr(str: any): any;
/**
 * find if a array contains the object using indexOf or a simple polyFill
 * @param {Array} src
 * @param {String} find
 * @param {String} [findByKey]
 * @return {Boolean|Number} false when not found, or the index
 */
export declare function inArray(src: any[], find: any, findByKey?: string): number;
/**
 * convert array-like objects to real arrays
 * @param {Object} obj
 * @return {Array}
 */
export declare function toArray(obj: any): any;
/**
 * unique array with objects based on a key (like 'id') or just by the array's value
 * @param {Array} src [{id:1},{id:2},{id:1}]
 * @param {String} [key]
 * @param {Boolean} [sort=False]
 * @return {Array} [{id:1},{id:2}]
 */
export declare function uniqueArray(src: any, key: any, sort: any): any[];
/**
 * get the prefixed property
 * @param {Object} obj
 * @param {String} property
 * @return {String|Undefined} prefixed
 */
export declare function prefixed(obj: any, property: any): any;
export declare function uniqueId(): number;
/**
 * get the window object of an element
 * @param {HTMLElement} element
 * @return {Window}
 */
export declare function getWindowForElement(element: HTMLElement): Window;
