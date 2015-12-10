import EditSession from "./EditSession";
/**
 * Provides access to require in packed noconflict mode
 * @param {String} moduleName
 * @returns {Object}
 **/
/**
 * Embeds the Ace editor into the DOM, at the element provided by `el`.
 * @param {String | DOMElement} el Either the id of an element, or the element itself
 */
export declare function edit(source: any): any;
/**
 * Creates a new [[EditSession]], and returns the associated [[Document]].
 * @param {Document | String} text {:textParam}
 * @param {TextMode} mode {:modeParam}
 *
 **/
export declare function createEditSession(text: any, mode?: any): EditSession;
