"use strict";
import HashHandler from '../keyboard/HashHandler';
var CLASSNAME = 'ace_autocomplete';
var CLASSNAME_SELECTED = 'ace_autocomplete_selected';
function outerHeight(element) {
    var height = Number(element.style.height.slice(0, -2));
    var padding = Number(element.style.paddingTop.slice(0, -2)) + Number(element.style.paddingBottom.slice(0, -2));
    var margin = Number(element.style.marginTop.slice(0, -2)) + Number(element.style.marginBottom.slice(0, -2));
    var border = Number(element.style.borderTop.slice(0, -2)) + Number(element.style.borderBottom.slice(0, -2));
    return height + padding + margin + border;
}
function position(el) {
    var _x = 0;
    var _y = 0;
    while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
        _x += el.offsetLeft - el.scrollLeft;
        _y += el.offsetTop - el.scrollTop;
        el = el.offsetParent;
    }
    return { top: _y, left: _x };
}
export default class AutoCompleteView {
    constructor(editor, autoComplete) {
        this.handler = new HashHandler();
        if (typeof editor === 'undefined') {
            throw new Error('editor must be defined');
        }
        if (typeof autoComplete === 'undefined') {
            throw new Error('autoComplete must be defined');
        }
        this.editor = editor;
        this.autoComplete = autoComplete;
        this.selectedClassName = CLASSNAME_SELECTED;
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
    show(coords) {
        this.setPosition(coords);
        return this.wrap.style.display = 'block';
    }
    hide() {
        return this.wrap.style.display = 'none';
    }
    setPosition(coords) {
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
    current() {
        var i;
        var children = this.listElement.childNodes;
        for (i in children) {
            var child = children[i];
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
                var firstChild = this.listElement.firstChild;
                firstChild.className = this.selectedClassName;
                return this.adjustPosition();
            }
        }
    }
    adjustPosition() {
        var elm;
        var elmOuterHeight;
        var newMargin;
        var pos;
        var preMargin;
        var wrapHeight;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXV0b0NvbXBsZXRlVmlldy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkF1dG9Db21wbGV0ZVZpZXcudHMiXSwibmFtZXMiOlsib3V0ZXJIZWlnaHQiLCJwb3NpdGlvbiIsIkF1dG9Db21wbGV0ZVZpZXciLCJBdXRvQ29tcGxldGVWaWV3LmNvbnN0cnVjdG9yIiwiQXV0b0NvbXBsZXRlVmlldy5zaG93IiwiQXV0b0NvbXBsZXRlVmlldy5oaWRlIiwiQXV0b0NvbXBsZXRlVmlldy5zZXRQb3NpdGlvbiIsIkF1dG9Db21wbGV0ZVZpZXcuY3VycmVudCIsIkF1dG9Db21wbGV0ZVZpZXcuZm9jdXNOZXh0IiwiQXV0b0NvbXBsZXRlVmlldy5mb2N1c1ByZXYiLCJBdXRvQ29tcGxldGVWaWV3LmVuc3VyZUZvY3VzIiwiQXV0b0NvbXBsZXRlVmlldy5hZGp1c3RQb3NpdGlvbiJdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO09BR04sV0FBVyxNQUFNLHlCQUF5QjtBQUdqRCxJQUFJLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztBQUNuQyxJQUFJLGtCQUFrQixHQUFHLDJCQUEyQixDQUFDO0FBRXJELHFCQUFxQixPQUFvQjtJQUNyQ0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkRBLElBQUlBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQy9HQSxJQUFJQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1R0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEdBQUdBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO0FBQzlDQSxDQUFDQTtBQUVELGtCQUFrQixFQUFlO0lBQzdCQyxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNYQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNYQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUN6REEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDcENBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLFNBQVNBLEdBQUdBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBO1FBQ2xDQSxFQUFFQSxH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LEdBQUdBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDakNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3REQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUMzRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdERBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RKLE9BQU9BO1FBQ0hLLElBQUlBLENBQUNBLENBQUNBO1FBQ05BLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBO1FBQzNDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsSUFBSUEsS0FBS0EsR0FBZ0JBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxLQUFLQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO2dCQUM3Q0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDakJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUNETCxTQUFTQTtRQUNMTSxJQUFJQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQTtRQUNoQkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDdEJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNwQkEsS0FBS0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQTtZQUN6Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFDakNBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0ROLFNBQVNBO1FBQ0xPLElBQUlBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBO1FBQ2hCQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtRQUN0QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ3BCQSxLQUFLQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBO1lBQ3pDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDRFAsV0FBV0E7UUFDUFEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsSUFBSUEsVUFBVUEsR0FBNkJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFVBQVVBLENBQUNBO2dCQUN2RUEsVUFBVUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQTtnQkFDOUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1lBQ2pDQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUNEUixjQUFjQTtRQUNWUyxJQUFJQSxHQUFnQkEsQ0FBQ0E7UUFDckJBLElBQUlBLGNBQXNCQSxDQUFDQTtRQUMzQkEsSUFBSUEsU0FBaUJBLENBQUNBO1FBQ3RCQSxJQUFJQSxHQUFrQkEsQ0FBQ0E7UUFDdkJBLElBQUlBLFNBQWlCQSxDQUFDQTtRQUN0QkEsSUFBSUEsVUFBa0JBLENBQUNBO1FBQ3ZCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtRQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDTkEsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDZkEsVUFBVUEsR0FBR0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLGNBQWNBLEdBQUdBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xDQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUU3RUEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsU0FBU0EsR0FBR0EsY0FBY0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2hEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtZQUNqREEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO2dCQUMxQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7WUFDakRBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0FBQ0xULENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IEVkaXRvciBmcm9tICcuLi9FZGl0b3InO1xuaW1wb3J0IEhhc2hIYW5kbGVyIGZyb20gJy4uL2tleWJvYXJkL0hhc2hIYW5kbGVyJztcbmltcG9ydCBQaXhlbFBvc2l0aW9uIGZyb20gJy4uL1BpeGVsUG9zaXRpb24nO1xuXG52YXIgQ0xBU1NOQU1FID0gJ2FjZV9hdXRvY29tcGxldGUnO1xudmFyIENMQVNTTkFNRV9TRUxFQ1RFRCA9ICdhY2VfYXV0b2NvbXBsZXRlX3NlbGVjdGVkJztcblxuZnVuY3Rpb24gb3V0ZXJIZWlnaHQoZWxlbWVudDogSFRNTEVsZW1lbnQpIHtcbiAgICB2YXIgaGVpZ2h0ID0gTnVtYmVyKGVsZW1lbnQuc3R5bGUuaGVpZ2h0LnNsaWNlKDAsIC0yKSk7XG4gICAgdmFyIHBhZGRpbmcgPSBOdW1iZXIoZWxlbWVudC5zdHlsZS5wYWRkaW5nVG9wLnNsaWNlKDAsIC0yKSkgKyBOdW1iZXIoZWxlbWVudC5zdHlsZS5wYWRkaW5nQm90dG9tLnNsaWNlKDAsIC0yKSk7XG4gICAgdmFyIG1hcmdpbiA9IE51bWJlcihlbGVtZW50LnN0eWxlLm1hcmdpblRvcC5zbGljZSgwLCAtMikpICsgTnVtYmVyKGVsZW1lbnQuc3R5bGUubWFyZ2luQm90dG9tLnNsaWNlKDAsIC0yKSk7XG4gICAgdmFyIGJvcmRlciA9IE51bWJlcihlbGVtZW50LnN0eWxlLmJvcmRlclRvcC5zbGljZSgwLCAtMikpICsgTnVtYmVyKGVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tLnNsaWNlKDAsIC0yKSk7XG4gICAgcmV0dXJuIGhlaWdodCArIHBhZGRpbmcgKyBtYXJnaW4gKyBib3JkZXI7XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uKGVsOiBIVE1MRWxlbWVudCkge1xuICAgIHZhciBfeCA9IDA7XG4gICAgdmFyIF95ID0gMDtcbiAgICB3aGlsZSAoZWwgJiYgIWlzTmFOKGVsLm9mZnNldExlZnQpICYmICFpc05hTihlbC5vZmZzZXRUb3ApKSB7XG4gICAgICAgIF94ICs9IGVsLm9mZnNldExlZnQgLSBlbC5zY3JvbGxMZWZ0O1xuICAgICAgICBfeSArPSBlbC5vZmZzZXRUb3AgLSBlbC5zY3JvbGxUb3A7XG4gICAgICAgIGVsID0gPEhUTUxFbGVtZW50PmVsLm9mZnNldFBhcmVudDtcbiAgICB9XG4gICAgcmV0dXJuIHsgdG9wOiBfeSwgbGVmdDogX3ggfTtcbn1cblxuLyoqXG4gKiBAY2xhc3MgQXV0b0NvbXBsZXRlVmlld1xuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBBdXRvQ29tcGxldGVWaWV3IHtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUgYXV0b0NvbXBsZXRlO1xuICAgIHByaXZhdGUgc2VsZWN0ZWRDbGFzc05hbWU7XG4gICAgcHVibGljIHdyYXA6IEhUTUxEaXZFbGVtZW50OyAgICAvLyBNdXN0IGJlIGFjY2Vzc2libGUuXG4gICAgcHVibGljIGxpc3RFbGVtZW50OiBIVE1MVUxpc3RFbGVtZW50OyAvLyBNdXN0IGJlIGFjY2Vzc2libGUuXG4gICAgcHJpdmF0ZSBoYW5kbGVyID0gbmV3IEhhc2hIYW5kbGVyKCk7XG4gICAgY29uc3RydWN0b3IoZWRpdG9yOiBFZGl0b3IsIGF1dG9Db21wbGV0ZSkge1xuICAgICAgICBpZiAodHlwZW9mIGVkaXRvciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignZWRpdG9yIG11c3QgYmUgZGVmaW5lZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgYXV0b0NvbXBsZXRlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhdXRvQ29tcGxldGUgbXVzdCBiZSBkZWZpbmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lZGl0b3IgPSBlZGl0b3I7XG4gICAgICAgIHRoaXMuYXV0b0NvbXBsZXRlID0gYXV0b0NvbXBsZXRlO1xuICAgICAgICB0aGlzLnNlbGVjdGVkQ2xhc3NOYW1lID0gQ0xBU1NOQU1FX1NFTEVDVEVEO1xuICAgICAgICAvLyBpbml0XG4gICAgICAgIHRoaXMud3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICB0aGlzLmxpc3RFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcbiAgICAgICAgdGhpcy53cmFwLmNsYXNzTmFtZSA9IENMQVNTTkFNRTtcbiAgICAgICAgdGhpcy53cmFwLmFwcGVuZENoaWxkKHRoaXMubGlzdEVsZW1lbnQpO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLndyYXApO1xuXG4gICAgICAgIHRoaXMud3JhcC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICB0aGlzLmxpc3RFbGVtZW50LnN0eWxlLmxpc3RTdHlsZVR5cGUgPSAnbm9uZSc7XG4gICAgICAgIHRoaXMud3JhcC5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG4gICAgICAgIHRoaXMud3JhcC5zdHlsZS56SW5kZXggPSAnMTAwMCc7XG4gICAgfVxuICAgIHNob3coY29vcmRzOiB7IHBhZ2VYOiBudW1iZXI7IHBhZ2VZOiBudW1iZXIgfSkge1xuICAgICAgICB0aGlzLnNldFBvc2l0aW9uKGNvb3Jkcyk7XG4gICAgICAgIHJldHVybiB0aGlzLndyYXAuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgfVxuICAgIGhpZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLndyYXAuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9XG4gICAgc2V0UG9zaXRpb24oY29vcmRzOiB7IHBhZ2VYOiBudW1iZXI7IHBhZ2VZOiBudW1iZXIgfSkge1xuICAgICAgICB2YXIgYm90dG9tLCBlZGl0b3JCb3R0b20sIHRvcDtcbiAgICAgICAgdG9wID0gY29vcmRzLnBhZ2VZICsgMjA7XG4gICAgICAgIGVkaXRvckJvdHRvbSA9IHRoaXMuZWRpdG9yLmNvbnRhaW5lci5vZmZzZXRUb3AgKyBwYXJzZUludCh0aGlzLmVkaXRvci5jb250YWluZXIuc3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgYm90dG9tID0gdG9wICsgcGFyc2VJbnQodGhpcy53cmFwLnN0eWxlLmhlaWdodCk7XG4gICAgICAgIGlmIChib3R0b20gPCBlZGl0b3JCb3R0b20pIHtcbiAgICAgICAgICAgIHRoaXMud3JhcC5zdHlsZS50b3AgPSB0b3AgKyAncHgnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMud3JhcC5zdHlsZS5sZWZ0ID0gY29vcmRzLnBhZ2VYICsgJ3B4JztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMud3JhcC5zdHlsZS50b3AgPSAodG9wIC0gcGFyc2VJbnQodGhpcy53cmFwLnN0eWxlLmhlaWdodCkgLSAyMCkgKyAncHgnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMud3JhcC5zdHlsZS5sZWZ0ID0gY29vcmRzLnBhZ2VYICsgJ3B4JztcbiAgICAgICAgfVxuICAgIH1cbiAgICBjdXJyZW50KCk6IEhUTUxFbGVtZW50IHtcbiAgICAgICAgdmFyIGk7XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IHRoaXMubGlzdEVsZW1lbnQuY2hpbGROb2RlcztcbiAgICAgICAgZm9yIChpIGluIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICB2YXIgY2hpbGQgPSA8SFRNTEVsZW1lbnQ+Y2hpbGRyZW5baV07XG4gICAgICAgICAgICBpZiAoY2hpbGQuY2xhc3NOYW1lID09PSB0aGlzLnNlbGVjdGVkQ2xhc3NOYW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBmb2N1c05leHQoKSB7XG4gICAgICAgIHZhciBjdXJyLCBmb2N1cztcbiAgICAgICAgY3VyciA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBmb2N1cyA9IGN1cnIubmV4dFNpYmxpbmc7XG4gICAgICAgIGlmIChmb2N1cykge1xuICAgICAgICAgICAgY3Vyci5jbGFzc05hbWUgPSAnJztcbiAgICAgICAgICAgIGZvY3VzLmNsYXNzTmFtZSA9IHRoaXMuc2VsZWN0ZWRDbGFzc05hbWU7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGp1c3RQb3NpdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvY3VzUHJldigpIHtcbiAgICAgICAgdmFyIGN1cnIsIGZvY3VzO1xuICAgICAgICBjdXJyID0gdGhpcy5jdXJyZW50KCk7XG4gICAgICAgIGZvY3VzID0gY3Vyci5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgIGlmIChmb2N1cykge1xuICAgICAgICAgICAgY3Vyci5jbGFzc05hbWUgPSAnJztcbiAgICAgICAgICAgIGZvY3VzLmNsYXNzTmFtZSA9IHRoaXMuc2VsZWN0ZWRDbGFzc05hbWU7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hZGp1c3RQb3NpdGlvbigpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVuc3VyZUZvY3VzKCkge1xuICAgICAgICBpZiAoIXRoaXMuY3VycmVudCgpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5saXN0RWxlbWVudC5maXJzdENoaWxkKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0Q2hpbGQ6IEhUTUxFbGVtZW50ID0gPEhUTUxFbGVtZW50PnRoaXMubGlzdEVsZW1lbnQuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgICAgICBmaXJzdENoaWxkLmNsYXNzTmFtZSA9IHRoaXMuc2VsZWN0ZWRDbGFzc05hbWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRqdXN0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBhZGp1c3RQb3NpdGlvbigpOiB2b2lkIHtcbiAgICAgICAgdmFyIGVsbTogSFRNTEVsZW1lbnQ7XG4gICAgICAgIHZhciBlbG1PdXRlckhlaWdodDogbnVtYmVyO1xuICAgICAgICB2YXIgbmV3TWFyZ2luOiBzdHJpbmc7XG4gICAgICAgIHZhciBwb3M6IFBpeGVsUG9zaXRpb247IC8vIHBvc2l0aW9uIG9mIGVsZW1lbnQgcmVsYXRpdmUgdG8gb2Zmc2V0IHBhcmVudFxuICAgICAgICB2YXIgcHJlTWFyZ2luOiBudW1iZXI7XG4gICAgICAgIHZhciB3cmFwSGVpZ2h0OiBudW1iZXI7XG4gICAgICAgIGVsbSA9IHRoaXMuY3VycmVudCgpO1xuICAgICAgICBpZiAoZWxtKSB7XG4gICAgICAgICAgICBuZXdNYXJnaW4gPSAnJztcbiAgICAgICAgICAgIHdyYXBIZWlnaHQgPSBwYXJzZUludCh0aGlzLndyYXAuc3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgICAgIGVsbU91dGVySGVpZ2h0ID0gb3V0ZXJIZWlnaHQoZWxtKTtcbiAgICAgICAgICAgIHByZU1hcmdpbiA9IHBhcnNlSW50KHRoaXMubGlzdEVsZW1lbnQuc3R5bGUubWFyZ2luVG9wLnJlcGxhY2UoJ3B4JywgJycpLCAxMCk7XG5cbiAgICAgICAgICAgIHBvcyA9IHBvc2l0aW9uKGVsbSk7XG4gICAgICAgICAgICBpZiAocG9zLnRvcCA+PSAod3JhcEhlaWdodCAtIGVsbU91dGVySGVpZ2h0KSkge1xuICAgICAgICAgICAgICAgIG5ld01hcmdpbiA9IChwcmVNYXJnaW4gLSBlbG1PdXRlckhlaWdodCkgKyAncHgnO1xuICAgICAgICAgICAgICAgIHRoaXMubGlzdEVsZW1lbnQuc3R5bGUubWFyZ2luVG9wID0gbmV3TWFyZ2luO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBvcy50b3AgPCAwKSB7XG4gICAgICAgICAgICAgICAgbmV3TWFyZ2luID0gKC1wb3MudG9wICsgcHJlTWFyZ2luKSArICdweCc7XG4gICAgICAgICAgICAgICAgdGhpcy5saXN0RWxlbWVudC5zdHlsZS5tYXJnaW5Ub3AgPSBuZXdNYXJnaW47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iXX0=