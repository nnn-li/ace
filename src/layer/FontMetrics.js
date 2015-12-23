"use strict";
import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import { isIE } from "../lib/useragent";
import EventEmitterClass from "../lib/EventEmitterClass";
var CHAR_COUNT = 0;
export default class FontMetrics {
    constructor(container, pollingInterval) {
        this.$characterSize = { width: 0, height: 0 };
        this.eventBus = new EventEmitterClass(this);
        this.el = createElement("div");
        this.$setMeasureNodeStyles(this.el.style, true);
        this.$main = createElement("div");
        this.$setMeasureNodeStyles(this.$main.style);
        this.$measureNode = createElement("div");
        this.$setMeasureNodeStyles(this.$measureNode.style);
        this.el.appendChild(this.$main);
        this.el.appendChild(this.$measureNode);
        container.appendChild(this.el);
        if (!CHAR_COUNT) {
            this.$testFractionalRect();
        }
        this.$measureNode.innerHTML = stringRepeat("X", CHAR_COUNT);
        this.$characterSize = { width: 0, height: 0 };
        this.checkForSizeChanges();
    }
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
    }
    $testFractionalRect() {
        var el = createElement("div");
        this.$setMeasureNodeStyles(el.style);
        el.style.width = "0.2px";
        document.documentElement.appendChild(el);
        var w = el.getBoundingClientRect().width;
        if (w > 0 && w < 1) {
            CHAR_COUNT = 1;
        }
        else {
            CHAR_COUNT = 100;
        }
        el.parentNode.removeChild(el);
    }
    $setMeasureNodeStyles(style, isRoot) {
        style.width = style.height = "auto";
        style.left = style.top = "-100px";
        style.visibility = "hidden";
        style.position = "fixed";
        style.whiteSpace = "pre";
        if (isIE < 8) {
            style["font-family"] = "inherit";
        }
        else {
            style.font = "inherit";
        }
        style.overflow = isRoot ? "hidden" : "visible";
    }
    checkForSizeChanges() {
        var size = this.$measureSizes();
        if (size && (this.$characterSize.width !== size.width || this.$characterSize.height !== size.height)) {
            this.$measureNode.style.fontWeight = "bold";
            var boldSize = this.$measureSizes();
            this.$measureNode.style.fontWeight = "";
            this.$characterSize = size;
            this.charSizes = Object.create(null);
            this.allowBoldFonts = boldSize && boldSize.width === size.width && boldSize.height === size.height;
            this.eventBus._emit("changeCharacterSize", { data: size });
        }
    }
    $pollSizeChanges() {
        if (this.$pollSizeChangesTimer) {
            return this.$pollSizeChangesTimer;
        }
        var self = this;
        return this.$pollSizeChangesTimer = setInterval(function () {
            self.checkForSizeChanges();
        }, 500);
    }
    setPolling(val) {
        if (val) {
            this.$pollSizeChanges();
        }
        else {
            if (this.$pollSizeChangesTimer) {
                this.$pollSizeChangesTimer;
            }
        }
    }
    $measureSizes() {
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
        if (size.width === 0 || size.height === 0) {
            return null;
        }
        return size;
    }
    $measureCharWidth(ch) {
        this.$main.innerHTML = stringRepeat(ch, CHAR_COUNT);
        var rect = this.$main.getBoundingClientRect();
        return rect.width / CHAR_COUNT;
    }
    getCharacterWidth(ch) {
        var w = this.charSizes[ch];
        if (w === undefined) {
            this.charSizes[ch] = this.$measureCharWidth(ch) / this.$characterSize.width;
        }
        return w;
    }
    destroy() {
        clearInterval(this.$pollSizeChangesTimer);
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9udE1ldHJpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJGb250TWV0cmljcy50cyJdLCJuYW1lcyI6WyJGb250TWV0cmljcyIsIkZvbnRNZXRyaWNzLmNvbnN0cnVjdG9yIiwiRm9udE1ldHJpY3Mub24iLCJGb250TWV0cmljcy5vZmYiLCJGb250TWV0cmljcy4kdGVzdEZyYWN0aW9uYWxSZWN0IiwiRm9udE1ldHJpY3MuJHNldE1lYXN1cmVOb2RlU3R5bGVzIiwiRm9udE1ldHJpY3MuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIkZvbnRNZXRyaWNzLiRwb2xsU2l6ZUNoYW5nZXMiLCJGb250TWV0cmljcy5zZXRQb2xsaW5nIiwiRm9udE1ldHJpY3MuJG1lYXN1cmVTaXplcyIsIkZvbnRNZXRyaWNzLiRtZWFzdXJlQ2hhcldpZHRoIiwiRm9udE1ldHJpY3MuZ2V0Q2hhcmFjdGVyV2lkdGgiLCJGb250TWV0cmljcy5kZXN0cm95Il0sIm1hcHBpbmdzIjoiQUF1QkEsWUFBWSxDQUFDO09BRU4sRUFBRSxhQUFhLEVBQUUsTUFBTSxZQUFZO09BQ25DLEVBQUUsWUFBWSxFQUFFLE1BQU0sYUFBYTtPQUNuQyxFQUFFLElBQUksRUFBRSxNQUFNLGtCQUFrQjtPQUVoQyxpQkFBaUIsTUFBTSwwQkFBMEI7QUFFeEQsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBS25CO0lBaUJJQSxZQUFZQSxTQUFzQkEsRUFBRUEsZUFBdUJBO1FBYnBEQyxtQkFBY0EsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFjNUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLGlCQUFpQkEsQ0FBY0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDekRBLElBQUlBLENBQUNBLEVBQUVBLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFD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SUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLENBQUNBO0lBQ0xBLENBQUNBO0FBQ0xaLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgeyBjcmVhdGVFbGVtZW50IH0gZnJvbSBcIi4uL2xpYi9kb21cIjtcbmltcG9ydCB7IHN0cmluZ1JlcGVhdCB9IGZyb20gXCIuLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHsgaXNJRSB9IGZyb20gXCIuLi9saWIvdXNlcmFnZW50XCI7XG5pbXBvcnQgRXZlbnRCdXMgZnJvbSBcIi4uL0V2ZW50QnVzXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4uL2xpYi9FdmVudEVtaXR0ZXJDbGFzc1wiO1xuXG52YXIgQ0hBUl9DT1VOVCA9IDA7XG5cbi8qKlxuICogQGNsYXNzIEZvbnRNZXRyaWNzXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEZvbnRNZXRyaWNzIGltcGxlbWVudHMgRXZlbnRCdXM8Rm9udE1ldHJpY3M+IHtcbiAgICBwcml2YXRlIGVsOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRtYWluOiBIVE1MRGl2RWxlbWVudDtcbiAgICBwcml2YXRlICRtZWFzdXJlTm9kZTogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHVibGljICRjaGFyYWN0ZXJTaXplID0geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG4gICAgcHJpdmF0ZSBjaGFyU2l6ZXM6IHsgW2NoOiBzdHJpbmddOiBudW1iZXIgfTtcbiAgICBwcml2YXRlIGFsbG93Qm9sZEZvbnRzOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHBvbGxTaXplQ2hhbmdlc1RpbWVyOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBldmVudEJ1czogRXZlbnRFbWl0dGVyQ2xhc3M8Rm9udE1ldHJpY3M+O1xuXG4gICAgLyoqXG4gICAgICogQGNsYXNzIEZvbnRNZXRyaWNzXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGNvbnRhaW5lciB7SFRNTEVsZW1lbnR9XG4gICAgICogQHBhcmFtIHBvbGxpbmdJbnRlcnZhbCB7bnVtYmVyfVxuICAgICAqL1xuICAgIC8vIEZJWE1FOiBUaGUgaW50ZXJ2YWwgc2hvdWxkIGJlIGJlaW5nIHVzZWQgdG8gY29uZmlndXJlIHRoZSBwb2xsaW5nIGludGVydmFsIChub3JtYWxseSA1MDBtcylcbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBwb2xsaW5nSW50ZXJ2YWw6IG51bWJlcikge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPEZvbnRNZXRyaWNzPih0aGlzKTtcbiAgICAgICAgdGhpcy5lbCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLiRzZXRNZWFzdXJlTm9kZVN0eWxlcyh0aGlzLmVsLnN0eWxlLCB0cnVlKTtcblxuICAgICAgICB0aGlzLiRtYWluID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJHNldE1lYXN1cmVOb2RlU3R5bGVzKHRoaXMuJG1haW4uc3R5bGUpO1xuXG4gICAgICAgIHRoaXMuJG1lYXN1cmVOb2RlID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuJHNldE1lYXN1cmVOb2RlU3R5bGVzKHRoaXMuJG1lYXN1cmVOb2RlLnN0eWxlKTtcblxuICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuJG1haW4pO1xuICAgICAgICB0aGlzLmVsLmFwcGVuZENoaWxkKHRoaXMuJG1lYXN1cmVOb2RlKTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWwpO1xuXG4gICAgICAgIGlmICghQ0hBUl9DT1VOVCkge1xuICAgICAgICAgICAgdGhpcy4kdGVzdEZyYWN0aW9uYWxSZWN0KCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kbWVhc3VyZU5vZGUuaW5uZXJIVE1MID0gc3RyaW5nUmVwZWF0KFwiWFwiLCBDSEFSX0NPVU5UKTtcblxuICAgICAgICB0aGlzLiRjaGFyYWN0ZXJTaXplID0geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG4gICAgICAgIHRoaXMuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogRm9udE1ldHJpY3MpID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogRm9udE1ldHJpY3MpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9uKGV2ZW50TmFtZSwgY2FsbGJhY2ssIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9mZlxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBGb250TWV0cmljcykgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogRm9udE1ldHJpY3MpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR0ZXN0RnJhY3Rpb25hbFJlY3QoKTogdm9pZCB7XG4gICAgICAgIHZhciBlbCA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLiRzZXRNZWFzdXJlTm9kZVN0eWxlcyhlbC5zdHlsZSk7XG4gICAgICAgIGVsLnN0eWxlLndpZHRoID0gXCIwLjJweFwiO1xuICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQoZWwpO1xuICAgICAgICB2YXIgdyA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLndpZHRoO1xuICAgICAgICAvLyBUT0RPOyBVc2UgYSB0ZXJuYXJ5IGNvbmRpdGlvbmFsLi4uXG4gICAgICAgIGlmICh3ID4gMCAmJiB3IDwgMSkge1xuICAgICAgICAgICAgQ0hBUl9DT1VOVCA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBDSEFSX0NPVU5UID0gMTAwO1xuICAgICAgICB9XG4gICAgICAgIGVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWwpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHNldE1lYXN1cmVOb2RlU3R5bGVzKHN0eWxlOiBDU1NTdHlsZURlY2xhcmF0aW9uLCBpc1Jvb3Q/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHN0eWxlLndpZHRoID0gc3R5bGUuaGVpZ2h0ID0gXCJhdXRvXCI7XG4gICAgICAgIHN0eWxlLmxlZnQgPSBzdHlsZS50b3AgPSBcIi0xMDBweFwiO1xuICAgICAgICBzdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgICAgICAgc3R5bGUucG9zaXRpb24gPSBcImZpeGVkXCI7XG4gICAgICAgIHN0eWxlLndoaXRlU3BhY2UgPSBcInByZVwiO1xuXG4gICAgICAgIGlmIChpc0lFIDwgOCkge1xuICAgICAgICAgICAgc3R5bGVbXCJmb250LWZhbWlseVwiXSA9IFwiaW5oZXJpdFwiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3R5bGUuZm9udCA9IFwiaW5oZXJpdFwiO1xuICAgICAgICB9XG4gICAgICAgIHN0eWxlLm92ZXJmbG93ID0gaXNSb290ID8gXCJoaWRkZW5cIiA6IFwidmlzaWJsZVwiO1xuICAgIH1cblxuICAgIHB1YmxpYyBjaGVja0ZvclNpemVDaGFuZ2VzKCk6IHZvaWQge1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuJG1lYXN1cmVTaXplcygpO1xuICAgICAgICBpZiAoc2l6ZSAmJiAodGhpcy4kY2hhcmFjdGVyU2l6ZS53aWR0aCAhPT0gc2l6ZS53aWR0aCB8fCB0aGlzLiRjaGFyYWN0ZXJTaXplLmhlaWdodCAhPT0gc2l6ZS5oZWlnaHQpKSB7XG4gICAgICAgICAgICB0aGlzLiRtZWFzdXJlTm9kZS5zdHlsZS5mb250V2VpZ2h0ID0gXCJib2xkXCI7XG4gICAgICAgICAgICB2YXIgYm9sZFNpemUgPSB0aGlzLiRtZWFzdXJlU2l6ZXMoKTtcbiAgICAgICAgICAgIHRoaXMuJG1lYXN1cmVOb2RlLnN0eWxlLmZvbnRXZWlnaHQgPSBcIlwiO1xuICAgICAgICAgICAgdGhpcy4kY2hhcmFjdGVyU2l6ZSA9IHNpemU7XG4gICAgICAgICAgICB0aGlzLmNoYXJTaXplcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgICAgICB0aGlzLmFsbG93Qm9sZEZvbnRzID0gYm9sZFNpemUgJiYgYm9sZFNpemUud2lkdGggPT09IHNpemUud2lkdGggJiYgYm9sZFNpemUuaGVpZ2h0ID09PSBzaXplLmhlaWdodDtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUNoYXJhY3RlclNpemVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgeyBkYXRhOiBzaXplIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljICRwb2xsU2l6ZUNoYW5nZXMoKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMuJHBvbGxTaXplQ2hhbmdlc1RpbWVyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXI7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgICAgICB9LCA1MDApO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0UG9sbGluZyh2YWw6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgdGhpcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRwb2xsU2l6ZUNoYW5nZXNUaW1lcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJG1lYXN1cmVTaXplcygpOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoQ0hBUl9DT1VOVCA9PT0gMSkge1xuICAgICAgICAgICAgdmFyIHJlY3Q6IENsaWVudFJlY3QgPSBudWxsO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZWN0ID0gdGhpcy4kbWVhc3VyZU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlY3QgPSB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAsIGxlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHNpemUgPSB7IGhlaWdodDogcmVjdC5oZWlnaHQsIHdpZHRoOiByZWN0LndpZHRoIH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgc2l6ZSA9IHsgaGVpZ2h0OiB0aGlzLiRtZWFzdXJlTm9kZS5jbGllbnRIZWlnaHQsIHdpZHRoOiB0aGlzLiRtZWFzdXJlTm9kZS5jbGllbnRXaWR0aCAvIENIQVJfQ09VTlQgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBTaXplIGFuZCB3aWR0aCBjYW4gYmUgbnVsbCBpZiB0aGUgZWRpdG9yIGlzIG5vdCB2aXNpYmxlIG9yXG4gICAgICAgIC8vIGRldGFjaGVkIGZyb20gdGhlIGRvY3VtZW50XG4gICAgICAgIGlmIChzaXplLndpZHRoID09PSAwIHx8IHNpemUuaGVpZ2h0ID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2l6ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRtZWFzdXJlQ2hhcldpZHRoKGNoOiBzdHJpbmcpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRtYWluLmlubmVySFRNTCA9IHN0cmluZ1JlcGVhdChjaCwgQ0hBUl9DT1VOVCk7XG4gICAgICAgIHZhciByZWN0ID0gdGhpcy4kbWFpbi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgcmV0dXJuIHJlY3Qud2lkdGggLyBDSEFSX0NPVU5UO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Q2hhcmFjdGVyV2lkdGgoY2g6IHN0cmluZyk6IG51bWJlciB7XG4gICAgICAgIHZhciB3ID0gdGhpcy5jaGFyU2l6ZXNbY2hdO1xuICAgICAgICBpZiAodyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoYXJTaXplc1tjaF0gPSB0aGlzLiRtZWFzdXJlQ2hhcldpZHRoKGNoKSAvIHRoaXMuJGNoYXJhY3RlclNpemUud2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHc7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuJHBvbGxTaXplQ2hhbmdlc1RpbWVyKTtcbiAgICAgICAgaWYgKHRoaXMuZWwgJiYgdGhpcy5lbC5wYXJlbnROb2RlKSB7XG4gICAgICAgICAgICB0aGlzLmVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5lbCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4vKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuIl19