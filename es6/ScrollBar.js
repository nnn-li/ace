"use strict";
import { createElement } from "./lib/dom";
import { addListener, preventDefault } from "./lib/event";
import EventEmitterClass from "./lib/event_emitter";
export default class ScrollBar extends EventEmitterClass {
    constructor(parent, classSuffix) {
        super();
        this.element = createElement("div");
        this.element.className = "ace_scrollbar ace_scrollbar" + classSuffix;
        this.inner = createElement("div");
        this.inner.className = "ace_scrollbar-inner";
        this.element.appendChild(this.inner);
        parent.appendChild(this.element);
        this.setVisible(false);
        this.skipEvent = false;
        addListener(this.element, "mousedown", preventDefault);
    }
    setVisible(isVisible) {
        this.element.style.display = isVisible ? "" : "none";
        this.isVisible = isVisible;
        return this;
    }
}
