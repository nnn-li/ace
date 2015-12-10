var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/event", './ScrollBar', "./lib/dom"], function (require, exports, event_1, ScrollBar_1, dom_1) {
    /**
     * Represents a vertical scroll bar.
     * @class VScrollBar
     */
    var VScrollBar = (function (_super) {
        __extends(VScrollBar, _super);
        /**
         * Creates a new `VScrollBar`. `parent` is the owner of the scroll bar.
         * @param {DOMElement} parent A DOM element
         * @param {Object} renderer An editor renderer
         *
         * @constructor
         */
        function VScrollBar(parent, renderer) {
            _super.call(this, parent, '-v');
            this._scrollTop = 0;
            // in OSX lion the scrollbars appear to have no width. In this case resize the
            // element to show the scrollbar but still pretend that the scrollbar has a width
            // of 0px
            // in Firefox 6+ scrollbar is hidden if element has the same width as scrollbar
            // make element a little bit wider to retain scrollbar when page is zoomed 
            renderer.$scrollbarWidth = this._width = dom_1.scrollbarWidth(parent.ownerDocument);
            this.inner.style.width = this.element.style.width = (this._width || 15) + 5 + "px";
            event_1.addListener(this.element, "scroll", this.onScroll.bind(this));
        }
        /**
         * Emitted when the scroll bar, well, scrolls.
         * @event scroll
         * @param {Object} e Contains one property, `"data"`, which indicates the current scroll top position
         **/
        VScrollBar.prototype.onScroll = function () {
            if (!this.skipEvent) {
                this._scrollTop = this.element.scrollTop;
                this._emit("scroll", { data: this._scrollTop });
            }
            this.skipEvent = false;
        };
        Object.defineProperty(VScrollBar.prototype, "width", {
            /**
             * Returns the width of the scroll bar.
             * @returns {Number}
             **/
            get: function () {
                return this.isVisible ? this._width : 0;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the height of the scroll bar, in pixels.
         * @param {Number} height The new height
         **/
        VScrollBar.prototype.setHeight = function (height) {
            this.element.style.height = height + "px";
        };
        /**
         * Sets the inner height of the scroll bar, in pixels.
         * @param {Number} height The new inner height
         * @deprecated Use setScrollHeight instead
         **/
        VScrollBar.prototype.setInnerHeight = function (height) {
            this.inner.style.height = height + "px";
        };
        /**
         * Sets the scroll height of the scroll bar, in pixels.
         * @param {Number} height The new scroll height
         **/
        VScrollBar.prototype.setScrollHeight = function (height) {
            this.inner.style.height = height + "px";
        };
        /**
         * Sets the scroll top of the scroll bar.
         * @param {Number} scrollTop The new scroll top
         **/
        // on chrome 17+ for small zoom levels after calling this function
        // this.element.scrollTop != scrollTop which makes page to scroll up.
        VScrollBar.prototype.setScrollTop = function (scrollTop) {
            if (this._scrollTop != scrollTop) {
                this.skipEvent = true;
                this._scrollTop = this.element.scrollTop = scrollTop;
            }
        };
        Object.defineProperty(VScrollBar.prototype, "scrollTop", {
            get: function () {
                return this._scrollTop;
            },
            enumerable: true,
            configurable: true
        });
        return VScrollBar;
    })(ScrollBar_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = VScrollBar;
});
