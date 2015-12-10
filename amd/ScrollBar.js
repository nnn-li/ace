var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/dom", "./lib/event", "./lib/event_emitter"], function (require, exports, dom_1, event_1, event_emitter_1) {
    /**
     * An abstract class representing a native scrollbar control.
     * @class ScrollBar
     **/
    var ScrollBar = (function (_super) {
        __extends(ScrollBar, _super);
        /**
         * Creates a new `ScrollBar`.
         *
         * @class
         * @constructor
         * @param parent {HTMLlement} A paent of the scrollbar.
         * @param classSuffix {string}
         */
        function ScrollBar(parent, classSuffix) {
            _super.call(this);
            this.element = dom_1.createElement("div");
            this.element.className = "ace_scrollbar ace_scrollbar" + classSuffix;
            this.inner = dom_1.createElement("div");
            this.inner.className = "ace_scrollbar-inner";
            this.element.appendChild(this.inner);
            parent.appendChild(this.element);
            this.setVisible(false);
            this.skipEvent = false;
            event_1.addListener(this.element, "mousedown", event.preventDefault);
        }
        /**
         * @method setVisible
         * @param isVisible {boolean}
         * @return {ScrollBar}
         */
        ScrollBar.prototype.setVisible = function (isVisible) {
            this.element.style.display = isVisible ? "" : "none";
            this.isVisible = isVisible;
            return this;
        };
        return ScrollBar;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = ScrollBar;
});
