import { addCssClass, createElement, removeCssClass, setCssClass } from "../lib/dom";
var IE8;
export default class Cursor {
    constructor(parentEl) {
        this.isVisible = false;
        this.isBlinking = true;
        this.blinkInterval = 1000;
        this.smoothBlinking = false;
        this.cursors = [];
        this.$padding = 0;
        this.element = createElement("div");
        this.element.className = "ace_layer ace_cursor-layer";
        parentEl.appendChild(this.element);
        if (IE8 === undefined)
            IE8 = "opacity" in this.element;
        this.cursor = this.addCursor();
        addCssClass(this.element, "ace_hidden-cursors");
        this.$updateCursors = this.$updateVisibility.bind(this);
    }
    $updateVisibility(val) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;)
            cursors[i].style.visibility = val ? "" : "hidden";
    }
    $updateOpacity(val) {
        var cursors = this.cursors;
        for (var i = cursors.length; i--;)
            cursors[i].style.opacity = val ? "" : "0";
    }
    setPadding(padding) {
        this.$padding = padding;
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
        var el = createElement("div");
        el.className = "ace_cursor";
        this.element.appendChild(el);
        this.cursors.push(el);
        return el;
    }
    removeCursor() {
        if (this.cursors.length > 1) {
            var el = this.cursors.pop();
            el.parentNode.removeChild(el);
            return el;
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
        if (!this.config || !this.session)
            return { left: 0, top: 0 };
        if (!position) {
            position = this.session.selection.getCursor();
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
        while (this.cursors.length > cursorIndex)
            this.removeCursor();
        var overwrite = this.session.getOverwrite();
        this.$setOverwrite(overwrite);
        this.$pixelPos = pixelPos;
        this.restartTimer();
    }
    $setOverwrite(overwrite) {
        if (overwrite != this.overwrite) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ3Vyc29yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xheWVyL0N1cnNvci50cyJdLCJuYW1lcyI6WyJDdXJzb3IiLCJDdXJzb3IuY29uc3RydWN0b3IiLCJDdXJzb3IuJHVwZGF0ZVZpc2liaWxpdHkiLCJDdXJzb3IuJHVwZGF0ZU9wYWNpdHkiLCJDdXJzb3Iuc2V0UGFkZGluZyIsIkN1cnNvci5zZXRTZXNzaW9uIiwiQ3Vyc29yLnNldEJsaW5raW5nIiwiQ3Vyc29yLnNldEJsaW5rSW50ZXJ2YWwiLCJDdXJzb3Iuc2V0U21vb3RoQmxpbmtpbmciLCJDdXJzb3IuYWRkQ3Vyc29yIiwiQ3Vyc29yLnJlbW92ZUN1cnNvciIsIkN1cnNvci5oaWRlQ3Vyc29yIiwiQ3Vyc29yLnNob3dDdXJzb3IiLCJDdXJzb3IucmVzdGFydFRpbWVyIiwiQ3Vyc29yLmdldFBpeGVsUG9zaXRpb24iLCJDdXJzb3IudXBkYXRlIiwiQ3Vyc29yLiRzZXRPdmVyd3JpdGUiLCJDdXJzb3IuZGVzdHJveSJdLCJtYXBwaW5ncyI6Ik9BOEJPLEVBQUMsV0FBVyxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFDLE1BQU0sWUFBWTtBQUdsRixJQUFJLEdBQUcsQ0FBQztBQUVSO0lBaUJJQSxZQUFZQSxRQUF3QkE7UUFkNUJDLGNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ25CQSxlQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNqQkEsa0JBQWFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JCQSxtQkFBY0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFHdkJBLFlBQU9BLEdBQXFCQSxFQUFFQSxDQUFDQTtRQUUvQkEsYUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFPakJBLElBQUlBLENBQUNBLE9BQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsNEJBQTRCQSxD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LFNBQWtCQTtRQUNwQ2dCLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQ1ZBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLElBQUlBO2dCQUNBQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSx1QkFBdUJBLENBQUNBLENBQUNBO1FBQzlEQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVNaEIsT0FBT0E7UUFDVmlCLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQy9CQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7QUFDTGpCLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge2FkZENzc0NsYXNzLCBjcmVhdGVFbGVtZW50LCByZW1vdmVDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuLi9saWIvZG9tXCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSAnLi4vRWRpdFNlc3Npb24nO1xuXG52YXIgSUU4O1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDdXJzb3Ige1xuICAgIHB1YmxpYyBlbGVtZW50OiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgaXNWaXNpYmxlID0gZmFsc2U7XG4gICAgcHVibGljIGlzQmxpbmtpbmcgPSB0cnVlO1xuICAgIHByaXZhdGUgYmxpbmtJbnRlcnZhbCA9IDEwMDA7XG4gICAgcHJpdmF0ZSBzbW9vdGhCbGlua2luZyA9IGZhbHNlO1xuICAgIHByaXZhdGUgaW50ZXJ2YWxJZDtcbiAgICBwcml2YXRlIHRpbWVvdXRJZDtcbiAgICBwcml2YXRlIGN1cnNvcnM6IEhUTUxEaXZFbGVtZW50W10gPSBbXTtcbiAgICBwcml2YXRlIGN1cnNvcjogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHJpdmF0ZSAkcGFkZGluZyA9IDA7XG4gICAgcHJpdmF0ZSBvdmVyd3JpdGU6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdXBkYXRlQ3Vyc29ycztcbiAgICBwcml2YXRlIGNvbmZpZztcbiAgICBwdWJsaWMgJHBpeGVsUG9zO1xuXG4gICAgY29uc3RydWN0b3IocGFyZW50RWw6IEhUTUxEaXZFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX2N1cnNvci1sYXllclwiO1xuICAgICAgICBwYXJlbnRFbC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgIGlmIChJRTggPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIElFOCA9IFwib3BhY2l0eVwiIGluIHRoaXMuZWxlbWVudDtcblxuICAgICAgICB0aGlzLmN1cnNvciA9IHRoaXMuYWRkQ3Vyc29yKCk7XG4gICAgICAgIGFkZENzc0NsYXNzKHRoaXMuZWxlbWVudCwgXCJhY2VfaGlkZGVuLWN1cnNvcnNcIik7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUN1cnNvcnMgPSB0aGlzLiR1cGRhdGVWaXNpYmlsaXR5LmJpbmQodGhpcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlVmlzaWJpbGl0eSh2YWwpIHtcbiAgICAgICAgdmFyIGN1cnNvcnMgPSB0aGlzLmN1cnNvcnM7XG4gICAgICAgIGZvciAodmFyIGkgPSBjdXJzb3JzLmxlbmd0aDsgaS0tOylcbiAgICAgICAgICAgIGN1cnNvcnNbaV0uc3R5bGUudmlzaWJpbGl0eSA9IHZhbCA/IFwiXCIgOiBcImhpZGRlblwiO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZU9wYWNpdHkodmFsKSB7XG4gICAgICAgIHZhciBjdXJzb3JzID0gdGhpcy5jdXJzb3JzO1xuICAgICAgICBmb3IgKHZhciBpID0gY3Vyc29ycy5sZW5ndGg7IGktLTspXG4gICAgICAgICAgICBjdXJzb3JzW2ldLnN0eWxlLm9wYWNpdHkgPSB2YWwgPyBcIlwiIDogXCIwXCI7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRTZXNzaW9uKHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXRCbGlua2luZyhibGlua2luZzogYm9vbGVhbikge1xuICAgICAgICBpZiAoYmxpbmtpbmcgIT09IHRoaXMuaXNCbGlua2luZykge1xuICAgICAgICAgICAgdGhpcy5pc0JsaW5raW5nID0gYmxpbmtpbmc7XG4gICAgICAgICAgICB0aGlzLnJlc3RhcnRUaW1lcigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXRCbGlua0ludGVydmFsKGJsaW5rSW50ZXJ2YWw6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoYmxpbmtJbnRlcnZhbCAhPT0gdGhpcy5ibGlua0ludGVydmFsKSB7XG4gICAgICAgICAgICB0aGlzLmJsaW5rSW50ZXJ2YWwgPSBibGlua0ludGVydmFsO1xuICAgICAgICAgICAgdGhpcy5yZXN0YXJ0VGltZXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZXRTbW9vdGhCbGlua2luZyhzbW9vdGhCbGlua2luZzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAoc21vb3RoQmxpbmtpbmcgIT0gdGhpcy5zbW9vdGhCbGlua2luZyAmJiAhSUU4KSB7XG4gICAgICAgICAgICB0aGlzLnNtb290aEJsaW5raW5nID0gc21vb3RoQmxpbmtpbmc7XG4gICAgICAgICAgICBzZXRDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX3Ntb290aC1ibGlua2luZ1wiLCBzbW9vdGhCbGlua2luZyk7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVDdXJzb3JzKHRydWUpO1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlQ3Vyc29ycyA9IChzbW9vdGhCbGlua2luZ1xuICAgICAgICAgICAgICAgID8gdGhpcy4kdXBkYXRlT3BhY2l0eVxuICAgICAgICAgICAgICAgIDogdGhpcy4kdXBkYXRlVmlzaWJpbGl0eSkuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMucmVzdGFydFRpbWVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZEN1cnNvcigpIHtcbiAgICAgICAgdmFyIGVsOiBIVE1MRGl2RWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBlbC5jbGFzc05hbWUgPSBcImFjZV9jdXJzb3JcIjtcbiAgICAgICAgdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGVsKTtcbiAgICAgICAgdGhpcy5jdXJzb3JzLnB1c2goZWwpO1xuICAgICAgICByZXR1cm4gZWw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVDdXJzb3IoKSB7XG4gICAgICAgIGlmICh0aGlzLmN1cnNvcnMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgdmFyIGVsID0gdGhpcy5jdXJzb3JzLnBvcCgpO1xuICAgICAgICAgICAgZWwucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbCk7XG4gICAgICAgICAgICByZXR1cm4gZWw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgaGlkZUN1cnNvcigpIHtcbiAgICAgICAgdGhpcy5pc1Zpc2libGUgPSBmYWxzZTtcbiAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5lbGVtZW50LCBcImFjZV9oaWRkZW4tY3Vyc29yc1wiKTtcbiAgICAgICAgdGhpcy5yZXN0YXJ0VGltZXIoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2hvd0N1cnNvcigpIHtcbiAgICAgICAgdGhpcy5pc1Zpc2libGUgPSB0cnVlO1xuICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX2hpZGRlbi1jdXJzb3JzXCIpO1xuICAgICAgICB0aGlzLnJlc3RhcnRUaW1lcigpO1xuICAgIH1cblxuICAgIHB1YmxpYyByZXN0YXJ0VGltZXIoKSB7XG4gICAgICAgIHZhciB1cGRhdGUgPSB0aGlzLiR1cGRhdGVDdXJzb3JzO1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxJZCk7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gICAgICAgIGlmICh0aGlzLnNtb290aEJsaW5raW5nKSB7XG4gICAgICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX3Ntb290aC1ibGlua2luZ1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHVwZGF0ZSh0cnVlKTtcblxuICAgICAgICBpZiAoIXRoaXMuaXNCbGlua2luZyB8fCAhdGhpcy5ibGlua0ludGVydmFsIHx8ICF0aGlzLmlzVmlzaWJsZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAodGhpcy5zbW9vdGhCbGlua2luZykge1xuICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBhZGRDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX3Ntb290aC1ibGlua2luZ1wiKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYmxpbmsgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB1cGRhdGUoZmFsc2UpO1xuICAgICAgICAgICAgfSwgMC42ICogdGhpcy5ibGlua0ludGVydmFsKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuaW50ZXJ2YWxJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdXBkYXRlKHRydWUpO1xuICAgICAgICAgICAgYmxpbmsoKTtcbiAgICAgICAgfSwgdGhpcy5ibGlua0ludGVydmFsKTtcblxuICAgICAgICBibGluaygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRQaXhlbFBvc2l0aW9uKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBvblNjcmVlbj8pIHtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZyB8fCAhdGhpcy5zZXNzaW9uKVxuICAgICAgICAgICAgcmV0dXJuIHsgbGVmdDogMCwgdG9wOiAwIH07XG5cbiAgICAgICAgaWYgKCFwb3NpdGlvbikge1xuICAgICAgICAgICAgcG9zaXRpb24gPSB0aGlzLnNlc3Npb24uc2VsZWN0aW9uLmdldEN1cnNvcigpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcbiAgICAgICAgdmFyIGN1cnNvckxlZnQgPSB0aGlzLiRwYWRkaW5nICsgcG9zLmNvbHVtbiAqIHRoaXMuY29uZmlnLmNoYXJhY3RlcldpZHRoO1xuICAgICAgICB2YXIgY3Vyc29yVG9wID0gKHBvcy5yb3cgLSAob25TY3JlZW4gPyB0aGlzLmNvbmZpZy5maXJzdFJvd1NjcmVlbiA6IDApKSAqIHRoaXMuY29uZmlnLmxpbmVIZWlnaHQ7XG5cbiAgICAgICAgcmV0dXJuIHsgbGVmdDogY3Vyc29yTGVmdCwgdG9wOiBjdXJzb3JUb3AgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlKGNvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICAvLyBTZWxlY3Rpb24gbWFya2VycyBpcyBhIGNvbmNlcHQgZnJvbSBtdWx0aSBzZWxlY3Rpb24uXG4gICAgICAgIHZhciBzZWxlY3Rpb25zID0gdGhpcy5zZXNzaW9uWyckc2VsZWN0aW9uTWFya2VycyddO1xuICAgICAgICB2YXIgaSA9IDAsIGN1cnNvckluZGV4ID0gMDtcblxuICAgICAgICBpZiAoc2VsZWN0aW9ucyA9PT0gdW5kZWZpbmVkIHx8IHNlbGVjdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBzZWxlY3Rpb25zID0gW3sgY3Vyc29yOiBudWxsIH1dO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgdmFyIHBpeGVsUG9zID0gdGhpcy5nZXRQaXhlbFBvc2l0aW9uKHNlbGVjdGlvbnNbaV0uY3Vyc29yLCB0cnVlKTtcbiAgICAgICAgICAgIGlmICgocGl4ZWxQb3MudG9wID4gY29uZmlnLmhlaWdodCArIGNvbmZpZy5vZmZzZXQgfHxcbiAgICAgICAgICAgICAgICBwaXhlbFBvcy50b3AgPCAwKSAmJiBpID4gMSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc3R5bGUgPSAodGhpcy5jdXJzb3JzW2N1cnNvckluZGV4KytdIHx8IHRoaXMuYWRkQ3Vyc29yKCkpLnN0eWxlO1xuXG4gICAgICAgICAgICBzdHlsZS5sZWZ0ID0gcGl4ZWxQb3MubGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgIHN0eWxlLnRvcCA9IHBpeGVsUG9zLnRvcCArIFwicHhcIjtcbiAgICAgICAgICAgIHN0eWxlLndpZHRoID0gY29uZmlnLmNoYXJhY3RlcldpZHRoICsgXCJweFwiO1xuICAgICAgICAgICAgc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHRoaXMuY3Vyc29ycy5sZW5ndGggPiBjdXJzb3JJbmRleClcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQ3Vyc29yKCk7XG5cbiAgICAgICAgdmFyIG92ZXJ3cml0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICAgICAgdGhpcy4kc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZSk7XG5cbiAgICAgICAgLy8gY2FjaGUgZm9yIHRleHRhcmVhIGFuZCBndXR0ZXIgaGlnaGxpZ2h0XG4gICAgICAgIHRoaXMuJHBpeGVsUG9zID0gcGl4ZWxQb3M7XG4gICAgICAgIHRoaXMucmVzdGFydFRpbWVyKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgICAgICBpZiAob3ZlcndyaXRlICE9IHRoaXMub3ZlcndyaXRlKSB7XG4gICAgICAgICAgICB0aGlzLm92ZXJ3cml0ZSA9IG92ZXJ3cml0ZTtcbiAgICAgICAgICAgIGlmIChvdmVyd3JpdGUpXG4gICAgICAgICAgICAgICAgYWRkQ3NzQ2xhc3ModGhpcy5lbGVtZW50LCBcImFjZV9vdmVyd3JpdGUtY3Vyc29yc1wiKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZW1vdmVDc3NDbGFzcyh0aGlzLmVsZW1lbnQsIFwiYWNlX292ZXJ3cml0ZS1jdXJzb3JzXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbElkKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICB9XG59XG4iXX0=