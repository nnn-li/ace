// TODO import jquery
declare var $: any;

import Editor from '../../Editor';
import HashHandler from '../../keyboard/HashHandler';

var CLASSNAME = 'ace_autocomplete';
var CLASSNAME_SELECTED = 'ace_autocomplete_selected';

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
        editorBottom = $(this.editor.container).offset().top + $(this.editor.container).height();
        bottom = top + $(this.wrap).height();
        if (bottom < editorBottom) {
            this.wrap.style.top = top + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        } else {
            this.wrap.style.top = (top - $(this.wrap).height() - 20) + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        }
    }
    current() {
        var child, children, i;
        children = this.listElement.childNodes;
        for (i in children) {
            child = children[i];
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
    adjustPosition() {
        var elm, elmOuterHeight, newMargin, pos, preMargin, wrapHeight;
        elm = this.current();
        if (elm) {
            newMargin = '';
            wrapHeight = $(this.wrap).height();
            elmOuterHeight = $(elm).outerHeight();
            preMargin = parseInt($(this.listElement).css("margin-top").replace('px', ''), 10);
            pos = $(elm).position();
            if (pos.top >= (wrapHeight - elmOuterHeight)) {
                newMargin = (preMargin - elmOuterHeight) + 'px';
                $(this.listElement).css("margin-top", newMargin);
            }
            if (pos.top < 0) {
                newMargin = (-pos.top + preMargin) + 'px';
                return $(this.listElement).css("margin-top", newMargin);
            }
        }
    }
}
