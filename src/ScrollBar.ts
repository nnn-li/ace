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
import { createElement } from "./lib/dom";
import { addListener } from "./lib/event";
import EventEmitterClass from "./lib/event_emitter";

/**
 * An abstract class representing a native scrollbar control.
 * @class ScrollBar
 **/
export default class ScrollBar extends EventEmitterClass {
    public element: HTMLDivElement;
    public inner: HTMLDivElement;
    public isVisible: boolean;
    public skipEvent: boolean;

    /**
     * Creates a new `ScrollBar`.
     *
     * @class
     * @constructor
     * @param parent {HTMLlement} A paent of the scrollbar.
     * @param classSuffix {string}
     */
    constructor(parent: HTMLElement, classSuffix: string) {
        super();
        this.element = <HTMLDivElement>createElement("div");
        this.element.className = "ace_scrollbar ace_scrollbar" + classSuffix;

        this.inner = <HTMLDivElement>createElement("div");
        this.inner.className = "ace_scrollbar-inner";
        this.element.appendChild(this.inner);

        parent.appendChild(this.element);

        this.setVisible(false);
        this.skipEvent = false;

        addListener(this.element, "mousedown", event.preventDefault);
    }

    /**
     * @method setVisible
     * @param isVisible {boolean}
     * @return {ScrollBar}
     */
    setVisible(isVisible: boolean): ScrollBar {
        this.element.style.display = isVisible ? "" : "none";
        this.isVisible = isVisible;
        return this;
    }
} 
