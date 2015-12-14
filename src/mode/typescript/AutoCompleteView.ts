"use strict";

import Editor from '../../Editor';
import PixelPosition from '../../PixelPosition';
import HashHandler from '../../keyboard/HashHandler';

var CLASSNAME = 'ace_autocomplete';
var CLASSNAME_SELECTED = 'ace_autocomplete_selected';

function outerHeight(element: HTMLElement) {
    var height = Number(element.style.height.slice(0, -2));
    var padding = Number(element.style.paddingTop.slice(0, -2)) + Number(element.style.paddingBottom.slice(0, -2));
    var margin = Number(element.style.marginTop.slice(0, -2)) + Number(element.style.marginBottom.slice(0, -2));
    var border = Number(element.style.borderTop.slice(0, -2)) + Number(element.style.borderBottom.slice(0, -2));
    return height + padding + margin + border;
}

function position(el: HTMLElement) {
    var _x = 0;
    var _y = 0;
    while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = <HTMLElement>el.offsetParent;
    }
    return { top: _y, left: _x };
}

/**
 * @class AutoCompleteView
 */
export default class AutoCompleteView {
    private editor: Editor;
    private autoComplete;
    private selectedClassName;
    public wrap: HTMLDivElement;    // Must be accessible.
    public listElement: HTMLUListElement; // Must be accessible.
    private handler = new HashHandler();
    constructor(editor: Editor, autoComplete) {
        if (typeof editor === 'undefined') {
            throw new Error('editor must be defined');
        }
        if (typeof autoComplete === 'undefined') {
            throw new Error('autoComplete must be defined');
        }
        this.editor = editor;
        this.autoComplete = autoComplete;
        this.selectedClassName = CLASSNAME_SELECTED;
        // init
        this.wrap = document.createElement('div');
        this.listElement = document.createElement('ul');
        this.wrap.className = CLASSNAME;
        this.wrap.appendChild(this.listElement);

        this.editor.container.appendChild(this.wrap);

        this.wrap.style.display = 'none';
        this.listElement.style.listStyleType = 'none';
        this.wrap.style.position = 'fixed';
        this.wrap.style.zIndex = '1000';
    }
    show(coords: { pageX: number; pageY: number }) {
        this.setPosition(coords);
        return this.wrap.style.display = 'block';
    }
    hide() {
        return this.wrap.style.display = 'none';
    }
    setPosition(coords: { pageX: number; pageY: number }) {
        var bottom, editorBottom, top;
        top = coords.pageY + 20;
        editorBottom = this.editor.container.offsetTop + parseInt(this.editor.container.style.height);
        bottom = top + parseInt(this.wrap.style.height);
        if (bottom < editorBottom) {
            this.wrap.style.top = top + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        }
        else {
            this.wrap.style.top = (top - parseInt(this.wrap.style.height) - 20) + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        }
    }
    current(): HTMLElement {
        var i;
        var children = this.listElement.childNodes;
        for (i in children) {
            var child = <HTMLElement>children[i];
            if (child.className === this.selectedClassName) {
                return child;
            }
        }
        return null;
    }
    focusNext() {
        var curr, focus;
        curr = this.current();
        focus = curr.nextSibling;
        if (focus) {
            curr.className = '';
            focus.className = this.selectedClassName;
            return this.adjustPosition();
        }
    }
    focusPrev() {
        var curr, focus;
        curr = this.current();
        focus = curr.previousSibling;
        if (focus) {
            curr.className = '';
            focus.className = this.selectedClassName;
            return this.adjustPosition();
        }
    }
    ensureFocus() {
        if (!this.current()) {
            if (this.listElement.firstChild) {
                var firstChild: HTMLElement = <HTMLElement>this.listElement.firstChild;
                firstChild.className = this.selectedClassName;
                return this.adjustPosition();
            }
        }
    }
    adjustPosition(): void {
        var elm: HTMLElement;
        var elmOuterHeight: number;
        var newMargin: string;
        var pos: PixelPosition; // position of element relative to offset parent
        var preMargin: number;
        var wrapHeight: number;
        elm = this.current();
        if (elm) {
            newMargin = '';
            wrapHeight = parseInt(this.wrap.style.height);
            elmOuterHeight = outerHeight(elm);
            preMargin = parseInt(this.listElement.style.marginTop.replace('px', ''), 10);

            pos = position(elm);
            if (pos.top >= (wrapHeight - elmOuterHeight)) {
                newMargin = (preMargin - elmOuterHeight) + 'px';
                this.listElement.style.marginTop = newMargin;
            }
            if (pos.top < 0) {
                newMargin = (-pos.top + preMargin) + 'px';
                this.listElement.style.marginTop = newMargin;
            }
        }
    }
}
