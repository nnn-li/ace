import ScrollBar from './ScrollBar';
import VirtualRenderer from "./VirtualRenderer";
/**
 * Represents a vertical scroll bar.
 * @class VScrollBar
 */
export default class VScrollBar extends ScrollBar {
    private _scrollTop;
    private _width;
    /**
     * Creates a new `VScrollBar`. `parent` is the owner of the scroll bar.
     * @param {DOMElement} parent A DOM element
     * @param {Object} renderer An editor renderer
     *
     * @constructor
     */
    constructor(parent: HTMLElement, renderer: VirtualRenderer);
    /**
     * Emitted when the scroll bar, well, scrolls.
     * @event scroll
     * @param {Object} e Contains one property, `"data"`, which indicates the current scroll top position
     **/
    onScroll(): void;
    /**
     * Returns the width of the scroll bar.
     * @returns {Number}
     **/
    width: number;
    /**
     * Sets the height of the scroll bar, in pixels.
     * @param {Number} height The new height
     **/
    setHeight(height: number): void;
    /**
     * Sets the inner height of the scroll bar, in pixels.
     * @param {Number} height The new inner height
     * @deprecated Use setScrollHeight instead
     **/
    setInnerHeight(height: number): void;
    /**
     * Sets the scroll height of the scroll bar, in pixels.
     * @param {Number} height The new scroll height
     **/
    setScrollHeight(height: number): void;
    /**
     * Sets the scroll top of the scroll bar.
     * @param {Number} scrollTop The new scroll top
     **/
    setScrollTop(scrollTop: number): void;
    scrollTop: number;
}
