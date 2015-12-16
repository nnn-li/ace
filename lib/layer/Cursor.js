"use strict";
import { addCssClass, createElement, removeCssClass, setCssClass } from "../lib/dom";
var IE8;
export default class Cursor {
    constructor(container) {
        this.isVisible = false;
        this.isBlinking = true;
        this.blinkInterval = 1000;
        this.smoothBlinking = false;
        this.cursors = [];
        this.$padding = 0;
        this.element = createElement("div");
        this.element.className = "ace_layer ace_cursor-layer";
        container.appendChild(this.element);
        if (IE8 === undefined) {
            IE8 = "opacity" in this.element;
        }
        this.cursor = this.addCursor();
        addCssClass(this.element, "ace_hidden-cursors");
        this.$updateCursors = this.$updateVisibility.bind(this);
    }
    $updateVisibility(val) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;) {
            cursors[i].style.visibility = val ? "" : "hidden";
        }
    }
    $updateOpacity(val) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;) {
            cursors[i].style.opacity = val ? "" : "0";
        }
    }
    setPadding(padding) {
        if (typeof padding === 'number') {
            this.$padding = padding;
        }
        else {
            throw new TypeError("padding must be a number");
        }
    }
    setSession(session) {
        this.session = session;
    }
    setBlinking(blinking) {
        if (blinking !== this.isBlinking) {
            this.isBlinking = blinking;
            this.restartTimer();
        }
    }
    setBlinkInterval(blinkInterval) {
        if (blinkInterval !== this.blinkInterval) {
            this.blinkInterval = blinkInterval;
            this.restartTimer();
        }
    }
    setSmoothBlinking(smoothBlinking) {
        if (smoothBlinking != this.smoothBlinking && !IE8) {
            this.smoothBlinking = smoothBlinking;
            setCssClass(this.element, "ace_smooth-blinking", smoothBlinking);
            this.$updateCursors(true);
            this.$updateCursors = (smoothBlinking
                ? this.$updateOpacity
                : this.$updateVisibility).bind(this);
            this.restartTimer();
        }
    }
    addCursor() {
        var el = createElement("div");
        el.className = "ace_cursor";
        this.element.appendChild(el);
        this.cursors.push(el);
        return el;
    }
    removeCursor() {
        if (this.cursors.length > 1) {
            var el = this.cursors.pop();
            el.parentNode.removeChild(el);
            return el;
        }
    }
    hideCursor() {
        this.isVisible = false;
        addCssClass(this.element, "ace_hidden-cursors");
        this.restartTimer();
    }
    showCursor() {
        this.isVisible = true;
        removeCssClass(this.element, "ace_hidden-cursors");
        this.restartTimer();
    }
    restartTimer() {
        var update = this.$updateCursors;
        clearInterval(this.intervalId);
        clearTimeout(this.timeoutId);
        if (this.smoothBlinking) {
            removeCssClass(this.element, "ace_smooth-blinking");
        }
        update(true);
        if (!this.isBlinking || !this.blinkInterval || !this.isVisible)
            return;
        if (this.smoothBlinking) {
            setTimeout(function () {
                addCssClass(this.element, "ace_smooth-blinking");
            }.bind(this));
        }
        var blink = function () {
            this.timeoutId = setTimeout(function () {
                update(false);
            }, 0.6 * this.blinkInterval);
        }.bind(this);
        this.intervalId = setInterval(function () {
            update(true);
            blink();
        }, this.blinkInterval);
        blink();
    }
    getPixelPosition(position, onScreen) {
        if (!this.config || !this.session) {
            return { left: 0, top: 0 };
        }
        if (!position) {
            position = this.session.getSelection().getCursor();
        }
        var pos = this.session.documentToScreenPosition(position.row, position.column);
        var cursorLeft = this.$padding + pos.column * this.config.characterWidth;
        var cursorTop = (pos.row - (onScreen ? this.config.firstRowScreen : 0)) * this.config.lineHeight;
        return { left: cursorLeft, top: cursorTop };
    }
    update(config) {
        this.config = config;
        var selections = this.session['$selectionMarkers'];
        var i = 0, cursorIndex = 0;
        if (selections === undefined || selections.length === 0) {
            selections = [{ cursor: null }];
        }
        for (var i = 0, n = selections.length; i < n; i++) {
            var pixelPos = this.getPixelPosition(selections[i].cursor, true);
            if ((pixelPos.top > config.height + config.offset ||
                pixelPos.top < 0) && i > 1) {
                continue;
            }
            var style = (this.cursors[cursorIndex++] || this.addCursor()).style;
            style.left = pixelPos.left + "px";
            style.top = pixelPos.top + "px";
            style.width = config.characterWidth + "px";
            style.height = config.lineHeight + "px";
        }
        while (this.cursors.length > cursorIndex) {
            this.removeCursor();
        }
        var overwrite = this.session.getOverwrite();
        this.$setOverwrite(overwrite);
        this.$pixelPos = pixelPos;
        this.restartTimer();
    }
    $setOverwrite(overwrite) {
        if (overwrite !== this.overwrite) {
            this.overwrite = overwrite;
            if (overwrite)
                addCssClass(this.element, "ace_overwrite-cursors");
            else
                removeCssClass(this.element, "ace_overwrite-cursors");
        }
    }
    destroy() {
        clearInterval(this.intervalId);
        clearTimeout(this.timeoutId);
    }
}