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

import { createElement } from "../lib/dom";
import {stringRepeat} from "../lib/lang";
import {isIE} from "../lib/useragent";
import { EventEmitterClass } from "../lib/event_emitter";

var CHAR_COUNT = 0;

// FIXME: This is the only export so make it the default.
export class FontMetrics extends EventEmitterClass {
    private el: HTMLDivElement;
    private $main: HTMLDivElement;
    private $measureNode: HTMLDivElement;
    public $characterSize = { width: 0, height: 0 };
    private charSizes: { [ch: string]: number };
    private allowBoldFonts: boolean;
    private $pollSizeChangesTimer: number;
    constructor(parentEl: HTMLElement, interval) {
        super();
        this.el = <HTMLDivElement>createElement("div");
        this.$setMeasureNodeStyles(this.el.style, true);

        this.$main = <HTMLDivElement>createElement("div");
        this.$setMeasureNodeStyles(this.$main.style);

        this.$measureNode = <HTMLDivElement>createElement("div");
        this.$setMeasureNodeStyles(this.$measureNode.style);


        this.el.appendChild(this.$main);
        this.el.appendChild(this.$measureNode);
        parentEl.appendChild(this.el);

        if (!CHAR_COUNT)
            this.$testFractionalRect();
        this.$measureNode.innerHTML = stringRepeat("X", CHAR_COUNT);

        this.$characterSize = { width: 0, height: 0 };
        this.checkForSizeChanges();
    }

    private $testFractionalRect() {
        var el = <HTMLDivElement>createElement("div");
        this.$setMeasureNodeStyles(el.style);
        el.style.width = "0.2px";
        document.documentElement.appendChild(el);
        var w = el.getBoundingClientRect().width;
        if (w > 0 && w < 1)
            CHAR_COUNT = 1;
        else
            CHAR_COUNT = 100;
        el.parentNode.removeChild(el);
    }

    private $setMeasureNodeStyles(style, isRoot?) {
        style.width = style.height = "auto";
        style.left = style.top = "-100px";
        style.visibility = "hidden";
        style.position = "fixed";
        style.whiteSpace = "pre";

        if (isIE < 8) {
            style["font-family"] = "inherit";
        } else {
            style.font = "inherit";
        }
        style.overflow = isRoot ? "hidden" : "visible";
    }

    public checkForSizeChanges() {
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

    public $pollSizeChanges() {
        if (this.$pollSizeChangesTimer)
            return this.$pollSizeChangesTimer;
        var self = this;
        return this.$pollSizeChangesTimer = setInterval(function() {
            self.checkForSizeChanges();
        }, 500);
    }

    private setPolling(val) {
        if (val) {
            this.$pollSizeChanges();
        }
        else {
            if (this.$pollSizeChangesTimer)
                this.$pollSizeChangesTimer;
        }
    }

    private $measureSizes() {
        if (CHAR_COUNT === 1) {
            var rect: ClientRect = null;
            try {
                rect = this.$measureNode.getBoundingClientRect();
            }
            catch (e) {
                rect = { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
            }
            var size = {
                height: rect.height,
                width: rect.width
            };
        } else {
            var size = {
                height: this.$measureNode.clientHeight,
                width: this.$measureNode.clientWidth / CHAR_COUNT
            };
        }
        // Size and width can be null if the editor is not visible or
        // detached from the document
        if (size.width === 0 || size.height === 0)
            return null;
        return size;
    }

    private $measureCharWidth(ch: string) {
        this.$main.innerHTML = stringRepeat(ch, CHAR_COUNT);
        var rect = this.$main.getBoundingClientRect();
        return rect.width / CHAR_COUNT;
    }

    private getCharacterWidth(ch: string) {
        var w = this.charSizes[ch];
        if (w === undefined) {
            this.charSizes[ch] = this.$measureCharWidth(ch) / this.$characterSize.width;
        }
        return w;
    }

    private destroy() {
        clearInterval(this.$pollSizeChangesTimer);
        if (this.el && this.el.parentNode)
            this.el.parentNode.removeChild(this.el);
    }
}
