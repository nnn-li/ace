/**
 * @class Tooltip
 */
export default class Tooltip {
    /**
     * @property isOpen
     * @type {boolean}
     * @defualt false
     */
    private isOpen;
    private $element;
    private $parentElement;
    /**
     * @class Tooltip
     * @constructor
     * @param parentElement {HTMLElement}
     */
    constructor(parentElement: HTMLElement);
    /**
     * This internal method is called (lazily) once through the `getElement` method.
     * It creates the $element member.
     * @method $init
     * @return {HTMLElement}
     * @private
     */
    private $init();
    /**
     * Provides the HTML div element.
     * @method getElement
     * @return {HTMLElement}
     */
    getElement(): HTMLElement;
    /**
     * Use the dom method `setInnerText`
     * @method setText
     * @param {string} text
     * @return {void}
     */
    setText(text: string): void;
    /**
     * Sets the `innerHTML` property on the div element.
     * @method setHtml
     * @param {string} html
     * @return {void}
     */
    setHtml(html: string): void;
    /**
     * Sets the `left` and `top` CSS style properties.
     * This action can also happen during the `show` method.
     * @method setPosition
     * @param {number} left The style 'left' value in pixels.
     * @param {number} top The style 'top' value in pixels.
     */
    setPosition(left: number, top: number): void;
    /**
     * Adds a CSS class to the underlying tooltip div element using the dom method `addCssClass`
     * @method setClassName
     * @param {string} className
     * @return {void}
     */
    setClassName(className: string): void;
    /**
     * Shows the tool by setting the CSS display property to 'block'.
     * The text parameter is optional, but if provided sets HTML.
     * FIXME: Remove the text parameter in favor of explicit pre-setting.
     * FIXME: Remove left and top too.
     * @method show
     * @param [string] text
     * @param [number] left
     * @param [number] top
     * @return {void}
     */
    show(text?: string, left?: number, top?: number): void;
    /**
     * Hides the tool by setting the CSS display property to 'none'.
     * @method hide
     * @return {void}
     */
    hide(): void;
    /**
     * Returns the `offsetHeight` property of the div element.
     * @method getHeight
     * @return {number}
     */
    getHeight(): number;
    /**
     * Returns the `offsetWidth` property of the div element.
     * @method getWidth
     * @return {number}
     */
    getWidth(): number;
}
