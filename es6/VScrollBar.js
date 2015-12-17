"use strict";
import { addListener } from "./lib/event";
import ScrollBar from './ScrollBar';
import { scrollbarWidth } from "./lib/dom";
export default class VScrollBar extends ScrollBar {
    constructor(parent, renderer) {
        super(parent, '-v');
        this._scrollTop = 0;
        renderer.$scrollbarWidth = this._width = scrollbarWidth(parent.ownerDocument);
        this.inner.style.width = this.element.style.width = (this._width || 15) + 5 + "px";
        addListener(this.element, "scroll", this.onScroll.bind(this));
    }
    onScroll() {
        if (!this.skipEvent) {
            this._scrollTop = this.element.scrollTop;
            this._emit("scroll", { data: this._scrollTop });
        }
        this.skipEvent = false;
    }
    get width() {
        return this.isVisible ? this._width : 0;
    }
    setHeight(height) {
        this.element.style.height = height + "px";
    }
    setInnerHeight(height) {
        this.inner.style.height = height + "px";
    }
    setScrollHeight(height) {
        this.inner.style.height = height + "px";
    }
    setScrollTop(scrollTop) {
        if (this._scrollTop != scrollTop) {
            this.skipEvent = true;
            this._scrollTop = this.element.scrollTop = scrollTop;
        }
    }
    get scrollTop() {
        return this._scrollTop;
    }
}
