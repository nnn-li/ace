var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/event", './ScrollBar'], function (require, exports, event_1, ScrollBar_1) {
    /**
     * Represents a horizontal scroll bar.
     * @class HScrollBar
     **/
    var HScrollBar = (function (_super) {
        __extends(HScrollBar, _super);
        /**
         * Creates a new `HScrollBar`. `parent` is the owner of the scroll bar.
         * @param {DOMElement} parent A DOM element
         * @param {Object} renderer An editor renderer
         *
         * @constructor
         **/
        function HScrollBar(parent, renderer) {
            _super.call(this, parent, '-h');
            this._scrollLeft = 0;
            // in OSX lion the scrollbars appear to have no width. In this case resize the
            // element to show the scrollbar but still pretend that the scrollbar has a width
            // of 0px
            // in Firefox 6+ scrollbar is hidden if element has the same width as scrollbar
            // make element a little bit wider to retain scrollbar when page is zoomed 
            this._height = renderer.$scrollbarWidth;
            this.inner.style.height = this.element.style.height = (this._height || 15) + 5 + "px";
            event_1.addListener(this.element, "scroll", this.onScroll.bind(this));
        }
        /**
         * Emitted when the scroll bar, well, scrolls.
         * @event scroll
         * @param {Object} e Contains one property, `"data"`, which indicates the current scroll left position
         **/
        HScrollBar.prototype.onScroll = function () {
            if (!this.skipEvent) {
                this._scrollLeft = this.element.scrollLeft;
                this._emit("scroll", { data: this._scrollLeft });
            }
            this.skipEvent = false;
        };
        Object.defineProperty(HScrollBar.prototype, "height", {
            /**
             * Returns the height of the scroll bar.
             * @returns {Number}
             **/
            get: function () {
                return this.isVisible ? this._height : 0;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the width of the scroll bar, in pixels.
         * @param {Number} width The new width
         **/
        HScrollBar.prototype.setWidth = function (width) {
            this.element.style.width = width + "px";
        };
        /**
         * Sets the inner width of the scroll bar, in pixels.
         * @param {Number} width The new inner width
         * @deprecated Use setScrollWidth instead
         **/
        HScrollBar.prototype.setInnerWidth = function (width) {
            this.inner.style.width = width + "px";
        };
        /**
         * Sets the scroll width of the scroll bar, in pixels.
         * @param {Number} width The new scroll width
         **/
        HScrollBar.prototype.setScrollWidth = function (width) {
            this.inner.style.width = width + "px";
        };
        /**
         * Sets the scroll left of the scroll bar.
         * @param {Number} scrollTop The new scroll left
         **/
        // on chrome 17+ for small zoom levels after calling this function
        // this.element.scrollTop != scrollTop which makes page to scroll up.
        HScrollBar.prototype.setScrollLeft = function (scrollLeft) {
            if (this._scrollLeft != scrollLeft) {
                this.skipEvent = true;
                this._scrollLeft = this.element.scrollLeft = scrollLeft;
            }
        };
        return HScrollBar;
    })(ScrollBar_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HScrollBar;
});
