"use strict";
import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import { isIE } from "../lib/useragent";
import EventEmitterClass from "../lib/event_emitter";
var CHAR_COUNT = 0;
export default class FontMetrics extends EventEmitterClass {
    constructor(container, pollingInterval) {
        super();
        this.$characterSize = { width: 0, height: 0 };
        this.el = createElement("div");
        this.$setMeasureNodeStyles(this.el.style, true);
        this.$main = createElement("div");
        this.$setMeasureNodeStyles(this.$main.style);
        this.$measureNode = createElement("div");
        this.$setMeasureNodeStyles(this.$measureNode.style);
        this.el.appendChild(this.$main);
        this.el.appendChild(this.$measureNode);
        container.appendChild(this.el);
        if (!CHAR_COUNT) {
            this.$testFractionalRect();
        }
        this.$measureNode.innerHTML = stringRepeat("X", CHAR_COUNT);
        this.$characterSize = { width: 0, height: 0 };
        this.checkForSizeChanges();
    }
    $testFractionalRect() {
        var el = createElement("div");
        this.$setMeasureNodeStyles(el.style);
        el.style.width = "0.2px";
        document.documentElement.appendChild(el);
        var w = el.getBoundingClientRect().width;
        if (w > 0 && w < 1) {
            CHAR_COUNT = 1;
        }
        else {
            CHAR_COUNT = 100;
        }
        el.parentNode.removeChild(el);
    }
    $setMeasureNodeStyles(style, isRoot) {
        style.width = style.height = "auto";
        style.left = style.top = "-100px";
        style.visibility = "hidden";
        style.position = "fixed";
        style.whiteSpace = "pre";
        if (isIE < 8) {
            style["font-family"] = "inherit";
        }
        else {
            style.font = "inherit";
        }
        style.overflow = isRoot ? "hidden" : "visible";
    }
    checkForSizeChanges() {
        var size = this.$measureSizes();
        if (size && (this.$characterSize.width !== size.width || this.$characterSize.height !== size.height)) {
            this.$measureNode.style.fontWeight = "bold";
            var boldSize = this.$measureSizes();
            this.$measureNode.style.fontWeight = "";
            this.$characterSize = size;
            this.charSizes = Object.create(null);
            this.allowBoldFonts = boldSize && boldSize.width === size.width && boldSize.height === size.height;
            this._emit("changeCharacterSize", { data: size });
        }
    }
    $pollSizeChanges() {
        if (this.$pollSizeChangesTimer) {
            return this.$pollSizeChangesTimer;
        }
        var self = this;
        return this.$pollSizeChangesTimer = setInterval(function () {
            self.checkForSizeChanges();
        }, 500);
    }
    setPolling(val) {
        if (val) {
            this.$pollSizeChanges();
        }
        else {
            if (this.$pollSizeChangesTimer) {
                this.$pollSizeChangesTimer;
            }
        }
    }
    $measureSizes() {
        if (CHAR_COUNT === 1) {
            var rect = null;
            try {
                rect = this.$measureNode.getBoundingClientRect();
            }
            catch (e) {
                rect = { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
            }
            var size = { height: rect.height, width: rect.width };
        }
        else {
            var size = { height: this.$measureNode.clientHeight, width: this.$measureNode.clientWidth / CHAR_COUNT };
        }
        if (size.width === 0 || size.height === 0) {
            return null;
        }
        return size;
    }
    $measureCharWidth(ch) {
        this.$main.innerHTML = stringRepeat(ch, CHAR_COUNT);
        var rect = this.$main.getBoundingClientRect();
        return rect.width / CHAR_COUNT;
    }
    getCharacterWidth(ch) {
        var w = this.charSizes[ch];
        if (w === undefined) {
            this.charSizes[ch] = this.$measureCharWidth(ch) / this.$characterSize.width;
        }
        return w;
    }
    destroy() {
        clearInterval(this.$pollSizeChangesTimer);
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
}
