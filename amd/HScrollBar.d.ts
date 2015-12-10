import ScrollBar from './ScrollBar';
import VirtualRenderer from "./VirtualRenderer";
/**
 * Represents a horizontal scroll bar.
 * @class HScrollBar
 **/
export default class HScrollBar extends ScrollBar {
    private _scrollLeft;
    private _height;
    /**
     * Creates a new `HScrollBar`. `parent` is the owner of the scroll bar.
     * @param {DOMElement} parent A DOM element
     * @param {Object} renderer An editor renderer
     *
     * @constructor
     **/
    constructor(parent: HTMLElement, renderer: VirtualRenderer);
    /**
     * Emitted when the scroll bar, well, scrolls.
     * @event scroll
     * @param {Object} e Contains one property, `"data"`, which indicates the current scroll left position
     **/
    onScroll(): void;
    /**
     * Returns the height of the scroll bar.
     * @return {Number}
     **/
    height: number;
    /**
     * Sets the width of the scroll bar, in pixels.
     * @param {Number} width The new width
     **/
    setWidth(width: number): void;
    /**
     * Sets the inner width of the scroll bar, in pixels.
     * @param {Number} width The new inner width
     * @deprecated Use setScrollWidth instead
     **/
    setInnerWidth(width: number): void;
    /**
     * Sets the scroll width of the scroll bar, in pixels.
     * @param {Number} width The new scroll width
     **/
    setScrollWidth(width: number): void;
    /**
     * Sets the scroll left of the scroll bar.
     * @param {Number} scrollTop The new scroll left
     **/
    setScrollLeft(scrollLeft: number): void;
}
