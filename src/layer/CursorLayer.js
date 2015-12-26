"use strict";
import { addCssClass, createElement, removeCssClass, setCssClass } from "../lib/dom";
import AbstractLayer from './AbstractLayer';
var IE8;
export default class CursorLayer extends AbstractLayer {
    constructor(parent) {
        super(parent, "ace_layer ace_cursor-layer");
        this.isVisible = false;
        this.isBlinking = true;
        this.blinkInterval = 1000;
        this.smoothBlinking = false;
        this.cursors = [];
        this.$padding = 0;
        if (IE8 === void 0) {
            IE8 = "opacity" in this.element;
        }
        this.cursor = this.addCursor();
        addCssClass(this.element, "ace_hidden-cursors");
        this.$updateCursors = this.$updateVisibility.bind(this);
    }
    $updateVisibility(visible) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;) {
            cursors[i].style.visibility = visible ? "" : "hidden";
        }
    }
    $updateOpacity(opaque) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;) {
            cursors[i].style.opacity = opaque ? "" : "0";
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
        var cursor = createElement("div");
        cursor.className = "ace_cursor";
        this.element.appendChild(cursor);
        this.cursors.push(cursor);
        return cursor;
    }
    removeCursor() {
        if (this.cursors.length > 1) {
            var cursor = this.cursors.pop();
            cursor.parentNode.removeChild(cursor);
            return cursor;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ3Vyc29yTGF5ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJDdXJzb3JMYXllci50cyJdLCJuYW1lcyI6WyJDdXJzb3JMYXllciIsIkN1cnNvckxheWVyLmNvbnN0cnVjdG9yIiwiQ3Vyc29yTGF5ZXIuJHVwZGF0ZVZpc2liaWxpdHkiLCJDdXJzb3JMYXllci4kdXBkYXRlT3BhY2l0eSIsIkN1cnNvckxheWVyLnNldFBhZGRpbmciLCJDdXJzb3JMYXllci5zZXRTZXNzaW9uIiwiQ3Vyc29yTGF5ZXIuc2V0QmxpbmtpbmciLCJDdXJzb3JMYXllci5zZXRCbGlua0ludGVydmFsIiwiQ3Vyc29yTGF5ZXIuc2V0U21vb3RoQmxpbmtpbmciLCJDdXJzb3JMYXllci5hZGRDdXJzb3IiLCJDdXJzb3JMYXllci5yZW1vdmVDdXJzb3IiLCJDdXJzb3JMYXllci5oaWRlQ3Vyc29yIiwiQ3Vyc29yTGF5ZXIuc2hvd0N1cnNvciIsIkN1cnNvckxheWVyLnJlc3RhcnRUaW1lciIsIkN1cnNvckxheWVyLmdldFBpeGVsUG9zaXRpb24iLCJDdXJzb3JMYXllci51cGRhdGUiLCJDdXJzb3JMYXllci4kc2V0T3ZlcndyaXRlIiwiQ3Vyc29yTGF5ZXIuZGVzdHJveSJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEVBQUMsV0FBVyxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFDLE1BQU0sWUFBWTtPQUMzRSxhQUFhLE1BQU0saUJBQWlCO0FBTTNDLElBQUksR0FBRyxDQUFDO0FBUVIseUNBQXlDLGFBQWE7SUFxQmxEQSxZQUFZQSxNQUFtQkE7UUFDM0JDLE1BQU1BLE1BQU1BLEVBQUVBLDRCQUE0QkEsQ0FBQ0EsQ0FBQUE7UUFwQnZDQSxjQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUNuQkEsZUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDakJBLGtCQUFhQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQkEsbUJBQWNBLEdBQUdBLEtBQUtBLENB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RUFBRUEsQ0FBQ0E7UUFDdkRBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0VBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBO1FBQ3pFQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUVqR0EsTUFBTUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsVUFBVUEsRUFBRUEsR0FBR0EsRUFBRUEsU0FBU0EsRUFBRUEsQ0FBQ0E7SUFDaERBLENBQUNBO0lBT01kLE1BQU1BLENBQUNBLE1BQW9CQTtRQUU5QmUsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFHckJBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO1FBRTNCQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxLQUFLQSxTQUFTQSxJQUFJQSxVQUFVQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsVUFBVUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDcENBLENBQUNBO1FBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBRWhEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBRWpFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQTtnQkFDN0NBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFFcEVBLEtBQUtBLENBQUNBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1lBQ2xDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNoQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDM0NBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxPQUFPQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxXQUFXQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDeEJBLENBQUNBO1FBRURBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUc5QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVPZixhQUFhQSxDQUFDQSxTQUFrQkE7UUFDcENnQixFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxLQUFLQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBO2dCQUNWQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSx1QkFBdUJBLENBQUNBLENBQUNBO1lBQ3ZEQSxJQUFJQTtnQkFDQUEsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsdUJBQXVCQSxDQUFDQSxDQUFDQTtRQUM5REEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNTWhCLE9BQU9BO1FBQ1ZpQixhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUMvQkEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDakNBLENBQUNBO0FBQ0xqQixDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTYgRGF2aWQgR2VvIEhvbG1lcyA8ZGF2aWQuZ2VvLmhvbG1lc0BnbWFpbC5jb20+XG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7YWRkQ3NzQ2xhc3MsIGNyZWF0ZUVsZW1lbnQsIHJlbW92ZUNzc0NsYXNzLCBzZXRDc3NDbGFzc30gZnJvbSBcIi4uL2xpYi9kb21cIjtcbmltcG9ydCBBYnN0cmFjdExheWVyIGZyb20gJy4vQWJzdHJhY3RMYXllcic7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSAnLi4vRWRpdFNlc3Npb24nO1xuaW1wb3J0IFBvc2l0aW9uIGZyb20gJy4uL1Bvc2l0aW9uJztcbmltcG9ydCBQaXhlbFBvc2l0aW9uIGZyb20gJy4uL1BpeGVsUG9zaXRpb24nO1xuaW1wb3J0IEN1cnNvckNvbmZpZyBmcm9tICcuL0N1cnNvckNvbmZpZyc7XG5cbnZhciBJRTg7XG5cbi8qKlxuICogVGhpcyBjbGFzcyBpcyB0aGUgSFRNTCByZXByZXNlbnRhdGlvbiBvZiB0aGUgQ3Vyc29yTGF5ZXIoTGF5ZXIpLlxuICpcbiAqIEBjbGFzcyBDdXJzb3JMYXllclxuICogQGV4dGVuZHMgQWJzdHJhY3RMYXllclxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDdXJzb3JMYXllciBleHRlbmRzIEFic3RyYWN0TGF5ZXIge1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSBpc1Zpc2libGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgaXNCbGlua2luZyA9IHRydWU7XG4gICAgcHJpdmF0ZSBibGlua0ludGVydmFsID0gMTAwMDtcbiAgICBwcml2YXRlIHNtb290aEJsaW5raW5nID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBpbnRlcnZhbElkOiBudW1iZXI7XG4gICAgcHJpdmF0ZSB0aW1lb3V0SWQ6IG51bWJlcjtcbiAgICBwcml2YXRlIGN1cnNvcnM6IEhUTUxEaXZFbGVtZW50W10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnNvcjogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSAkcGFkZGluZzogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlIG92ZXJ3cml0ZTogYm9vbGVhbjtcbiAgICBwcml2YXRlICR1cGRhdGVDdXJzb3JzOiAoZG9JdDogYm9vbGVhbikgPT4gdm9pZDtcbiAgICBwdWJsaWMgY29uZmlnOiBDdXJzb3JDb25maWc7XG4gICAgcHVibGljICRwaXhlbFBvczogUGl4ZWxQb3NpdGlvbjtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBDdXJzb3JMYXllclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBwYXJlbnQge0hUTUxFbGVtZW50fVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50LCBcImFjZV9sYXllciBhY2VfY3Vyc29yLWxheWVyXCIpXG5cbiAgICAgICAgaWYgKElFOCA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICBJRTggPSBcIm9wYWNpdHlcIiBpbiB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmN1cnNvciA9IHRoaXMuYWRkQ3Vyc29yKCk7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuZWxlbWVudCwgXCJhY2VfaGlkZGVuLWN1cnNvcnNcIik7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUN1cnNvcnMgPSB0aGlzLiR1cGRhdGVWaXNpYmlsaXR5LmJpbmQodGhpcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlVmlzaWJpbGl0eSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHZhciBjdXJzb3JzID0gdGhpcy5jdXJzb3JzO1xuICAgICAgICBmb3IgKHZhciBpID0gY3Vyc29ycy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIGN1cnNvcnNbaV0uc3R5bGUudmlzaWJpbGl0eSA9IHZpc2libGUgPyBcIlwiIDogXCJoaWRkZW5cIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZU9wYWNpdHkob3BhcXVlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHZhciBjdXJzb3JzID0gdGhpcy5jdXJzb3JzO1xuICAgICAgICBmb3IgKHZhciBpID0gY3Vyc29ycy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIGN1cnNvcnNbaV0uc3R5bGUub3BhY2l0eSA9IG9wYXF1ZSA/IFwiXCIgOiBcIjBcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UGFkZGluZ1xuICAgICAqIEBwYXJhbSBwYWRkaW5nIHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYWRkaW5nID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicGFkZGluZyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNldEJsaW5raW5nKGJsaW5raW5nOiBib29sZWFuKSB7XG4gICAgICAgIGlmIChibGlua2luZyAhPT0gdGhpcy5pc0JsaW5raW5nKSB7XG4gICAgICAgICAgICB0aGlzLmlzQmxpbmtpbmcgPSBibGlua2luZztcbiAgICAgICAgICAgIHRoaXMucmVzdGFydFRpbWVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldEJsaW5rSW50ZXJ2YWwoYmxpbmtJbnRlcnZhbDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmIChibGlua0ludGVydmFsICE9PSB0aGlzLmJsaW5rSW50ZXJ2YWwpIHtcbiAgICAgICAgICAgIHRoaXMuYmxpbmtJbnRlcnZhbCA9IGJsaW5rSW50ZXJ2YWw7XG4gICAgICAgICAgICB0aGlzLnJlc3RhcnRUaW1lcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRTbW9vdGhCbGlua2luZ1xuICAgICAqIEBwYXJhbSBzbW9vdGhCbGlua2luZyB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRTbW9vdGhCbGlua2luZyhzbW9vdGhCbGlua2luZzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAoc21vb3RoQmxpbmtpbmcgIT0gdGhpcy5zbW9vdGhCbGlua2luZyAmJiAhSUU4KSB7XG4gICAgICAgICAgICB0aGlzLnNtb290aEJsaW5raW5nID0gc21vb3RoQmxpbmtpbmc7XG4gICAgICAgICAgICBzZXRDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX3Ntb290aC1ibGlua2luZ1wiLCBzbW9vdGhCbGlua2luZyk7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVDdXJzb3JzKHRydWUpO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ3Vyc29ycyA9IChzbW9vdGhCbGlua2luZ1xuICAgICAgICAgICAgICAgID8gdGhpcy4kdXBkYXRlT3BhY2l0eVxuICAgICAgICAgICAgICAgIDogdGhpcy4kdXBkYXRlVmlzaWJpbGl0eSkuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMucmVzdGFydFRpbWVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZEN1cnNvcigpOiBIVE1MRGl2RWxlbWVudCB7XG4gICAgICAgIHZhciBjdXJzb3I6IEhUTUxEaXZFbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGN1cnNvci5jbGFzc05hbWUgPSBcImFjZV9jdXJzb3JcIjtcbiAgICAgICAgdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGN1cnNvcik7XG4gICAgICAgIHRoaXMuY3Vyc29ycy5wdXNoKGN1cnNvcik7XG4gICAgICAgIHJldHVybiBjdXJzb3I7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVDdXJzb3IoKTogSFRNTERpdkVsZW1lbnQge1xuICAgICAgICBpZiAodGhpcy5jdXJzb3JzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmN1cnNvcnMucG9wKCk7XG4gICAgICAgICAgICBjdXJzb3IucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChjdXJzb3IpO1xuICAgICAgICAgICAgcmV0dXJuIGN1cnNvcjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgaGlkZUN1cnNvclxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIGhpZGVDdXJzb3IoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuaXNWaXNpYmxlID0gZmFsc2U7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuZWxlbWVudCwgXCJhY2VfaGlkZGVuLWN1cnNvcnNcIik7XG4gICAgICAgIHRoaXMucmVzdGFydFRpbWVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzaG93Q3Vyc29yXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2hvd0N1cnNvcigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5pc1Zpc2libGUgPSB0cnVlO1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX2hpZGRlbi1jdXJzb3JzXCIpO1xuICAgICAgICB0aGlzLnJlc3RhcnRUaW1lcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgcmVzdGFydFRpbWVyXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVzdGFydFRpbWVyKCk6IHZvaWQge1xuICAgICAgICB2YXIgdXBkYXRlID0gdGhpcy4kdXBkYXRlQ3Vyc29ycztcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsSWQpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICAgICBpZiAodGhpcy5zbW9vdGhCbGlua2luZykge1xuICAgICAgICAgICAgcmVtb3ZlQ3NzQ2xhc3ModGhpcy5lbGVtZW50LCBcImFjZV9zbW9vdGgtYmxpbmtpbmdcIik7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGUodHJ1ZSk7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzQmxpbmtpbmcgfHwgIXRoaXMuYmxpbmtJbnRlcnZhbCB8fCAhdGhpcy5pc1Zpc2libGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKHRoaXMuc21vb3RoQmxpbmtpbmcpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5lbGVtZW50LCBcImFjZV9zbW9vdGgtYmxpbmtpbmdcIik7XG4gICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGJsaW5rID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlKGZhbHNlKTtcbiAgICAgICAgICAgIH0sIDAuNiAqIHRoaXMuYmxpbmtJbnRlcnZhbCk7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgICB0aGlzLmludGVydmFsSWQgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHVwZGF0ZSh0cnVlKTtcbiAgICAgICAgICAgIGJsaW5rKCk7XG4gICAgICAgIH0sIHRoaXMuYmxpbmtJbnRlcnZhbCk7XG5cbiAgICAgICAgYmxpbmsoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldFBpeGVsUG9zaXRpb25cbiAgICAgKiBAcGFyYW0gW3Bvc2l0aW9uXSB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIFtvblNjcmVlbl0ge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7UGl4ZWxQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0UGl4ZWxQb3NpdGlvbihwb3NpdGlvbj86IFBvc2l0aW9uLCBvblNjcmVlbj86IGJvb2xlYW4pOiBQaXhlbFBvc2l0aW9uIHtcblxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnIHx8ICF0aGlzLnNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybiB7IGxlZnQ6IDAsIHRvcDogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwb3NpdGlvbikge1xuICAgICAgICAgICAgcG9zaXRpb24gPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0Q3Vyc29yKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcG9zID0gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG5cbiAgICAgICAgdmFyIGN1cnNvckxlZnQgPSB0aGlzLiRwYWRkaW5nICsgcG9zLmNvbHVtbiAqIHRoaXMuY29uZmlnLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgY3Vyc29yVG9wID0gKHBvcy5yb3cgLSAob25TY3JlZW4gPyB0aGlzLmNvbmZpZy5maXJzdFJvd1NjcmVlbiA6IDApKSAqIHRoaXMuY29uZmlnLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHsgbGVmdDogY3Vyc29yTGVmdCwgdG9wOiBjdXJzb3JUb3AgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZVxuICAgICAqIEBwYXJhbSBjb25maWcge0N1cnNvckNvbmZpZ31cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyB1cGRhdGUoY29uZmlnOiBDdXJzb3JDb25maWcpOiB2b2lkIHtcblxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICAvLyBTZWxlY3Rpb24gbWFya2VycyBpcyBhIGNvbmNlcHQgZnJvbSBtdWx0aSBzZWxlY3Rpb24uXG4gICAgICAgIHZhciBzZWxlY3Rpb25zID0gdGhpcy5zZXNzaW9uWyckc2VsZWN0aW9uTWFya2VycyddO1xuICAgICAgICB2YXIgaSA9IDAsIGN1cnNvckluZGV4ID0gMDtcblxuICAgICAgICBpZiAoc2VsZWN0aW9ucyA9PT0gdW5kZWZpbmVkIHx8IHNlbGVjdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBzZWxlY3Rpb25zID0gW3sgY3Vyc29yOiBudWxsIH1dO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IG47IGkrKykge1xuXG4gICAgICAgICAgICB2YXIgcGl4ZWxQb3MgPSB0aGlzLmdldFBpeGVsUG9zaXRpb24oc2VsZWN0aW9uc1tpXS5jdXJzb3IsIHRydWUpO1xuXG4gICAgICAgICAgICBpZiAoKHBpeGVsUG9zLnRvcCA+IGNvbmZpZy5oZWlnaHQgKyBjb25maWcub2Zmc2V0IHx8XG4gICAgICAgICAgICAgICAgcGl4ZWxQb3MudG9wIDwgMCkgJiYgaSA+IDEpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHN0eWxlID0gKHRoaXMuY3Vyc29yc1tjdXJzb3JJbmRleCsrXSB8fCB0aGlzLmFkZEN1cnNvcigpKS5zdHlsZTtcblxuICAgICAgICAgICAgc3R5bGUubGVmdCA9IHBpeGVsUG9zLmxlZnQgKyBcInB4XCI7XG4gICAgICAgICAgICBzdHlsZS50b3AgPSBwaXhlbFBvcy50b3AgKyBcInB4XCI7XG4gICAgICAgICAgICBzdHlsZS53aWR0aCA9IGNvbmZpZy5jaGFyYWN0ZXJXaWR0aCArIFwicHhcIjtcbiAgICAgICAgICAgIHN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKHRoaXMuY3Vyc29ycy5sZW5ndGggPiBjdXJzb3JJbmRleCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVDdXJzb3IoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvdmVyd3JpdGUgPSB0aGlzLnNlc3Npb24uZ2V0T3ZlcndyaXRlKCk7XG4gICAgICAgIHRoaXMuJHNldE92ZXJ3cml0ZShvdmVyd3JpdGUpO1xuXG4gICAgICAgIC8vIGNhY2hlIGZvciB0ZXh0YXJlYSBhbmQgZ3V0dGVyIGhpZ2hsaWdodFxuICAgICAgICB0aGlzLiRwaXhlbFBvcyA9IHBpeGVsUG9zO1xuICAgICAgICB0aGlzLnJlc3RhcnRUaW1lcigpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKG92ZXJ3cml0ZSAhPT0gdGhpcy5vdmVyd3JpdGUpIHtcbiAgICAgICAgICAgIHRoaXMub3ZlcndyaXRlID0gb3ZlcndyaXRlO1xuICAgICAgICAgICAgaWYgKG92ZXJ3cml0ZSlcbiAgICAgICAgICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX292ZXJ3cml0ZS1jdXJzb3JzXCIpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJlbW92ZUNzc0NsYXNzKHRoaXMuZWxlbWVudCwgXCJhY2Vfb3ZlcndyaXRlLWN1cnNvcnNcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGRlc3Ryb3lcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxJZCk7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gICAgfVxufVxuIl19