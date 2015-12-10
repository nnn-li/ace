/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
define(["require", "exports", "../lib/dom"], function (require, exports, dom_1) {
    var IE8;
    var Cursor = (function () {
        function Cursor(parentEl) {
            this.isVisible = false;
            this.isBlinking = true;
            this.blinkInterval = 1000;
            this.smoothBlinking = false;
            this.cursors = [];
            this.$padding = 0;
            this.element = dom_1.createElement("div");
            this.element.className = "ace_layer ace_cursor-layer";
            parentEl.appendChild(this.element);
            if (IE8 === undefined)
                IE8 = "opacity" in this.element;
            this.cursor = this.addCursor();
            dom_1.addCssClass(this.element, "ace_hidden-cursors");
            this.$updateCursors = this.$updateVisibility.bind(this);
        }
        Cursor.prototype.$updateVisibility = function (val) {
            var cursors = this.cursors;
            for (var i = cursors.length; i--;)
                cursors[i].style.visibility = val ? "" : "hidden";
        };
        Cursor.prototype.$updateOpacity = function (val) {
            var cursors = this.cursors;
            for (var i = cursors.length; i--;)
                cursors[i].style.opacity = val ? "" : "0";
        };
        Cursor.prototype.setPadding = function (padding) {
            this.$padding = padding;
        };
        Cursor.prototype.setSession = function (session) {
            this.session = session;
        };
        Cursor.prototype.setBlinking = function (blinking) {
            if (blinking !== this.isBlinking) {
                this.isBlinking = blinking;
                this.restartTimer();
            }
        };
        Cursor.prototype.setBlinkInterval = function (blinkInterval) {
            if (blinkInterval !== this.blinkInterval) {
                this.blinkInterval = blinkInterval;
                this.restartTimer();
            }
        };
        Cursor.prototype.setSmoothBlinking = function (smoothBlinking) {
            if (smoothBlinking != this.smoothBlinking && !IE8) {
                this.smoothBlinking = smoothBlinking;
                dom_1.setCssClass(this.element, "ace_smooth-blinking", smoothBlinking);
                this.$updateCursors(true);
                this.$updateCursors = (smoothBlinking
                    ? this.$updateOpacity
                    : this.$updateVisibility).bind(this);
                this.restartTimer();
            }
        };
        Cursor.prototype.addCursor = function () {
            var el = dom_1.createElement("div");
            el.className = "ace_cursor";
            this.element.appendChild(el);
            this.cursors.push(el);
            return el;
        };
        Cursor.prototype.removeCursor = function () {
            if (this.cursors.length > 1) {
                var el = this.cursors.pop();
                el.parentNode.removeChild(el);
                return el;
            }
        };
        Cursor.prototype.hideCursor = function () {
            this.isVisible = false;
            dom_1.addCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
        Cursor.prototype.showCursor = function () {
            this.isVisible = true;
            dom_1.removeCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
        Cursor.prototype.restartTimer = function () {
            var update = this.$updateCursors;
            clearInterval(this.intervalId);
            clearTimeout(this.timeoutId);
            if (this.smoothBlinking) {
                dom_1.removeCssClass(this.element, "ace_smooth-blinking");
            }
            update(true);
            if (!this.isBlinking || !this.blinkInterval || !this.isVisible)
                return;
            if (this.smoothBlinking) {
                setTimeout(function () {
                    dom_1.addCssClass(this.element, "ace_smooth-blinking");
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
        };
        Cursor.prototype.getPixelPosition = function (position, onScreen) {
            if (!this.config || !this.session)
                return { left: 0, top: 0 };
            if (!position) {
                position = this.session.getSelection().getCursor();
            }
            var pos = this.session.documentToScreenPosition(position.row, position.column);
            var cursorLeft = this.$padding + pos.column * this.config.characterWidth;
            var cursorTop = (pos.row - (onScreen ? this.config.firstRowScreen : 0)) * this.config.lineHeight;
            return { left: cursorLeft, top: cursorTop };
        };
        Cursor.prototype.update = function (config) {
            this.config = config;
            // Selection markers is a concept from multi selection.
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
            while (this.cursors.length > cursorIndex)
                this.removeCursor();
            var overwrite = this.session.getOverwrite();
            this.$setOverwrite(overwrite);
            // cache for textarea and gutter highlight
            this.$pixelPos = pixelPos;
            this.restartTimer();
        };
        Cursor.prototype.$setOverwrite = function (overwrite) {
            if (overwrite != this.overwrite) {
                this.overwrite = overwrite;
                if (overwrite)
                    dom_1.addCssClass(this.element, "ace_overwrite-cursors");
                else
                    dom_1.removeCssClass(this.element, "ace_overwrite-cursors");
            }
        };
        Cursor.prototype.destroy = function () {
            clearInterval(this.intervalId);
            clearTimeout(this.timeoutId);
        };
        return Cursor;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Cursor;
});
