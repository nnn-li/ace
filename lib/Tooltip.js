"use strict";
import { addCssClass, createElement, setInnerText } from "./lib/dom";
export default class Tooltip {
    constructor(parentElement) {
        this.isOpen = false;
        this.$element = null;
        this.$parentElement = parentElement;
    }
    $init() {
        this.$element = createElement('div');
        this.$element.className = "ace_tooltip";
        this.$element.style.display = "none";
        this.$parentElement.appendChild(this.$element);
        return this.$element;
    }
    getElement() {
        return this.$element || this.$init();
    }
    setText(text) {
        setInnerText(this.getElement(), text);
    }
    setHtml(html) {
        this.getElement().innerHTML = html;
    }
    setPosition(left, top) {
        var style = this.getElement().style;
        style.left = left + "px";
        style.top = top + "px";
    }
    setClassName(className) {
        addCssClass(this.getElement(), className);
    }
    show(text, left, top) {
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
    }
    hide() {
        if (this.isOpen) {
            this.getElement().style.display = 'none';
            this.isOpen = false;
        }
    }
    getHeight() {
        return this.getElement().offsetHeight;
    }
    getWidth() {
        return this.getElement().offsetWidth;
    }
}
