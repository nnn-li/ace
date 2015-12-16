"use strict";
import { addListener } from "./lib/event";
import ScrollBar from './ScrollBar';
export default class HScrollBar extends ScrollBar {
    constructor(parent, renderer) {
        super(parent, '-h');
        this._scrollLeft = 0;
        this._height = renderer.$scrollbarWidth;
        this.inner.style.height = this.element.style.height = (this._height || 15) + 5 + "px";
        addListener(this.element, "scroll", this.onScroll.bind(this));
    }
    onScroll() {
        if (!this.skipEvent) {
            this._scrollLeft = this.element.scrollLeft;
            this._emit("scroll", { data: this._scrollLeft });
        }
        this.skipEvent = false;
    }
    get height() {
        return this.isVisible ? this._height : 0;
    }
    setWidth(width) {
        this.element.style.width = width + "px";
    }
    setInnerWidth(width) {
        this.inner.style.width = width + "px";
    }
    setScrollWidth(width) {
        this.inner.style.width = width + "px";
    }
    setScrollLeft(scrollLeft) {
        if (this._scrollLeft != scrollLeft) {
            this.skipEvent = true;
            this._scrollLeft = this.element.scrollLeft = scrollLeft;
        }
    }
}
