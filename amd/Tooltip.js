define(["require", "exports", "./lib/dom"], function (require, exports, dom_1) {
    /**
     * @class Tooltip
     */
    var Tooltip = (function () {
        /**
         * @class Tooltip
         * @constructor
         * @param parentElement {HTMLElement}
         */
        function Tooltip(parentElement) {
            this.isOpen = false;
            this.$element = null;
            this.$parentElement = parentElement;
        }
        /**
         * This internal method is called (lazily) once through the `getElement` method.
         * It creates the $element member.
         * @method $init
         * @return {HTMLElement}
         * @private
         */
        Tooltip.prototype.$init = function () {
            this.$element = dom_1.createElement('div');
            this.$element.className = "ace_tooltip";
            this.$element.style.display = "none";
            this.$parentElement.appendChild(this.$element);
            return this.$element;
        };
        /**
         * Provides the HTML div element.
         * @method getElement
         * @return {HTMLElement}
         */
        Tooltip.prototype.getElement = function () {
            return this.$element || this.$init();
        };
        /**
         * Use the dom method `setInnerText`
         * @method setText
         * @param {string} text
         * @return {void}
         */
        Tooltip.prototype.setText = function (text) {
            dom_1.setInnerText(this.getElement(), text);
        };
        /**
         * Sets the `innerHTML` property on the div element.
         * @method setHtml
         * @param {string} html
         * @return {void}
         */
        Tooltip.prototype.setHtml = function (html) {
            this.getElement().innerHTML = html;
        };
        /**
         * Sets the `left` and `top` CSS style properties.
         * This action can also happen during the `show` method.
         * @method setPosition
         * @param {number} left The style 'left' value in pixels.
         * @param {number} top The style 'top' value in pixels.
         */
        Tooltip.prototype.setPosition = function (left, top) {
            var style = this.getElement().style;
            style.left = left + "px";
            style.top = top + "px";
        };
        /**
         * Adds a CSS class to the underlying tooltip div element using the dom method `addCssClass`
         * @method setClassName
         * @param {string} className
         * @return {void}
         */
        Tooltip.prototype.setClassName = function (className) {
            dom_1.addCssClass(this.getElement(), className);
        };
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
        Tooltip.prototype.show = function (text, left, top) {
            if (typeof text === 'string') {
                this.setText(text);
            }
            if ((typeof left === 'number') && (typeof top === 'number')) {
                this.setPosition(left, top);
            }
            if (!this.isOpen) {
                this.getElement().style.display = 'block';
                this.isOpen = true;
            }
        };
        /**
         * Hides the tool by setting the CSS display property to 'none'.
         * @method hide
         * @return {void}
         */
        Tooltip.prototype.hide = function () {
            if (this.isOpen) {
                this.getElement().style.display = 'none';
                this.isOpen = false;
            }
        };
        /**
         * Returns the `offsetHeight` property of the div element.
         * @method getHeight
         * @return {number}
         */
        Tooltip.prototype.getHeight = function () {
            return this.getElement().offsetHeight;
        };
        /**
         * Returns the `offsetWidth` property of the div element.
         * @method getWidth
         * @return {number}
         */
        Tooltip.prototype.getWidth = function () {
            return this.getElement().offsetWidth;
        };
        return Tooltip;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Tooltip;
});
