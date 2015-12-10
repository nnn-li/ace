var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "../lib/dom", "../lib/lang", "../lib/useragent", "../lib/event_emitter"], function (require, exports, dom_1, lang_1, useragent_1, event_emitter_1) {
    var CHAR_COUNT = 0;
    var FontMetrics = (function (_super) {
        __extends(FontMetrics, _super);
        function FontMetrics(parentEl, interval) {
            _super.call(this);
            this.$characterSize = { width: 0, height: 0 };
            this.el = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.el.style, true);
            this.$main = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.$main.style);
            this.$measureNode = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.$measureNode.style);
            this.el.appendChild(this.$main);
            this.el.appendChild(this.$measureNode);
            parentEl.appendChild(this.el);
            if (!CHAR_COUNT) {
                this.$testFractionalRect();
            }
            this.$measureNode.innerHTML = lang_1.stringRepeat("X", CHAR_COUNT);
            this.$characterSize = { width: 0, height: 0 };
            this.checkForSizeChanges();
        }
        FontMetrics.prototype.$testFractionalRect = function () {
            var el = dom_1.createElement("div");
            this.$setMeasureNodeStyles(el.style);
            el.style.width = "0.2px";
            document.documentElement.appendChild(el);
            var w = el.getBoundingClientRect().width;
            // TODO; Use a ternary conditional...
            if (w > 0 && w < 1) {
                CHAR_COUNT = 1;
            }
            else {
                CHAR_COUNT = 100;
            }
            el.parentNode.removeChild(el);
        };
        FontMetrics.prototype.$setMeasureNodeStyles = function (style, isRoot) {
            style.width = style.height = "auto";
            style.left = style.top = "-100px";
            style.visibility = "hidden";
            style.position = "fixed";
            style.whiteSpace = "pre";
            if (useragent_1.isIE < 8) {
                style["font-family"] = "inherit";
            }
            else {
                style.font = "inherit";
            }
            style.overflow = isRoot ? "hidden" : "visible";
        };
        FontMetrics.prototype.checkForSizeChanges = function () {
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
        };
        FontMetrics.prototype.$pollSizeChanges = function () {
            if (this.$pollSizeChangesTimer) {
                return this.$pollSizeChangesTimer;
            }
            var self = this;
            return this.$pollSizeChangesTimer = setInterval(function () {
                self.checkForSizeChanges();
            }, 500);
        };
        FontMetrics.prototype.setPolling = function (val) {
            if (val) {
                this.$pollSizeChanges();
            }
            else {
                if (this.$pollSizeChangesTimer) {
                    this.$pollSizeChangesTimer;
                }
            }
        };
        FontMetrics.prototype.$measureSizes = function () {
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
            // Size and width can be null if the editor is not visible or
            // detached from the document
            if (size.width === 0 || size.height === 0) {
                return null;
            }
            return size;
        };
        FontMetrics.prototype.$measureCharWidth = function (ch) {
            this.$main.innerHTML = lang_1.stringRepeat(ch, CHAR_COUNT);
            var rect = this.$main.getBoundingClientRect();
            return rect.width / CHAR_COUNT;
        };
        FontMetrics.prototype.getCharacterWidth = function (ch) {
            var w = this.charSizes[ch];
            if (w === undefined) {
                this.charSizes[ch] = this.$measureCharWidth(ch) / this.$characterSize.width;
            }
            return w;
        };
        FontMetrics.prototype.destroy = function () {
            clearInterval(this.$pollSizeChangesTimer);
            if (this.el && this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
        };
        return FontMetrics;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = FontMetrics;
});
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
