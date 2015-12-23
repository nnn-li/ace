"use strict";
import { addListener } from "./lib/event";
import ScrollBar from './ScrollBar';
export default class HScrollBar extends ScrollBar {
    constructor(parent, renderer) {
        super(parent, '-h');
        this._scrollLeft = 0;
        this._height = renderer.$scrollbarWidth;
        this.inner.style.height = this.element.style.height = (this._height || 15) + 5 + "px";
        addListener(this.element, "scroll", this.onScroll.bind(this));
    }
    onScroll() {
        if (!this.skipEvent) {
            this._scrollLeft = this.element.scrollLeft;
            this.eventBus._emit("scroll", { data: this._scrollLeft });
        }
        this.skipEvent = false;
    }
    get height() {
        return this.isVisible ? this._height : 0;
    }
    setWidth(width) {
        this.element.style.width = width + "px";
    }
    setInnerWidth(width) {
        this.inner.style.width = width + "px";
    }
    setScrollWidth(width) {
        this.inner.style.width = width + "px";
    }
    setScrollLeft(scrollLeft) {
        if (this._scrollLeft != scrollLeft) {
            this.skipEvent = true;
            this._scrollLeft = this.element.scrollLeft = scrollLeft;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSFNjcm9sbEJhci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIkhTY3JvbGxCYXIudHMiXSwibmFtZXMiOlsiSFNjcm9sbEJhciIsIkhTY3JvbGxCYXIuY29uc3RydWN0b3IiLCJIU2Nyb2xsQmFyLm9uU2Nyb2xsIiwiSFNjcm9sbEJhci5oZWlnaHQiLCJIU2Nyb2xsQmFyLnNldFdpZHRoIiwiSFNjcm9sbEJhci5zZXRJbm5lcldpZHRoIiwiSFNjcm9sbEJhci5zZXRTY3JvbGxXaWR0aCIsIkhTY3JvbGxCYXIuc2V0U2Nyb2xsTGVmdCJdLCJtYXBwaW5ncyI6IkFBdUJBLFlBQVksQ0FBQztPQUVOLEVBQUUsV0FBVyxFQUFFLE1BQU0sYUFBYTtPQUNsQyxTQUFTLE1BQU0sYUFBYTtBQVFuQyx3Q0FBd0MsU0FBUztJQVk3Q0EsWUFBWUEsTUFBbUJBLEVBQUVBLFFBQXlCQTtRQUN0REMsTUFBTUEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFYaEJBLGdCQUFXQSxHQUFHQSxDQUFDQSxDQUFDQTtRQWtCcEJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBO1FBQ3hDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0RkEsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbEVBLENBQUNBO0lBT0RELFFBQVFBO1FBQ0pFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUszQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDOURBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO0lBQzNCQSxDQUFDQTtJQU1ERixJQUFJQSxNQUFNQTtRQUNORyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUM3Q0EsQ0FBQ0E7SUFNREgsUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJJLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO0lBQzVDQSxDQUFDQTtJQU9ESixhQUFhQSxDQUFDQSxLQUFhQTtRQUN2QkssSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBTURMLGNBQWNBLENBQUNBLEtBQWFBO1FBQ3hCTSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUMxQ0EsQ0FBQ0E7SUFRRE4sYUFBYUEsQ0FBQ0EsVUFBa0JBO1FBQzVCTyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxJQUFJQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEdBQUdBLFVBQVVBLENBQUNBO1FBQzVEQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMUCxDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTYgRGF2aWQgR2VvIEhvbG1lcyA8ZGF2aWQuZ2VvLmhvbG1lc0BnbWFpbC5jb20+XG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IHsgYWRkTGlzdGVuZXIgfSBmcm9tIFwiLi9saWIvZXZlbnRcIjtcbmltcG9ydCBTY3JvbGxCYXIgZnJvbSAnLi9TY3JvbGxCYXInO1xuaW1wb3J0IFZpcnR1YWxSZW5kZXJlciBmcm9tIFwiLi9WaXJ0dWFsUmVuZGVyZXJcIjtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgaG9yaXpvbnRhbCBzY3JvbGwgYmFyLlxuICpcbiAqIEBjbGFzcyBIU2Nyb2xsQmFyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEhTY3JvbGxCYXIgZXh0ZW5kcyBTY3JvbGxCYXIge1xuXG4gICAgcHJpdmF0ZSBfc2Nyb2xsTGVmdCA9IDA7XG4gICAgcHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBgSFNjcm9sbEJhcmAuIGBwYXJlbnRgIGlzIHRoZSBvd25lciBvZiB0aGUgc2Nyb2xsIGJhci5cbiAgICAgKlxuICAgICAqIEBjbGFzcyBIU2Nyb2xsQmFyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHBhcmVudCB7SFRNTEVsZW1lbnR9IEEgRE9NIGVsZW1lbnQuXG4gICAgICogQHBhcmFtIHJlbmRlcmVyIHtWaXJ0dWFsUmVuZGVyZXJ9IEFuIGVkaXRvciByZW5kZXJlci5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50LCByZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyKSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCwgJy1oJyk7XG5cbiAgICAgICAgLy8gaW4gT1NYIGxpb24gdGhlIHNjcm9sbGJhcnMgYXBwZWFyIHRvIGhhdmUgbm8gd2lkdGguIEluIHRoaXMgY2FzZSByZXNpemUgdGhlXG4gICAgICAgIC8vIGVsZW1lbnQgdG8gc2hvdyB0aGUgc2Nyb2xsYmFyIGJ1dCBzdGlsbCBwcmV0ZW5kIHRoYXQgdGhlIHNjcm9sbGJhciBoYXMgYSB3aWR0aFxuICAgICAgICAvLyBvZiAwcHhcbiAgICAgICAgLy8gaW4gRmlyZWZveCA2KyBzY3JvbGxiYXIgaXMgaGlkZGVuIGlmIGVsZW1lbnQgaGFzIHRoZSBzYW1lIHdpZHRoIGFzIHNjcm9sbGJhclxuICAgICAgICAvLyBtYWtlIGVsZW1lbnQgYSBsaXR0bGUgYml0IHdpZGVyIHRvIHJldGFpbiBzY3JvbGxiYXIgd2hlbiBwYWdlIGlzIHpvb21lZCBcbiAgICAgICAgdGhpcy5faGVpZ2h0ID0gcmVuZGVyZXIuJHNjcm9sbGJhcldpZHRoO1xuICAgICAgICB0aGlzLmlubmVyLnN0eWxlLmhlaWdodCA9IHRoaXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAodGhpcy5faGVpZ2h0IHx8IDE1KSArIDUgKyBcInB4XCI7XG4gICAgICAgIGFkZExpc3RlbmVyKHRoaXMuZWxlbWVudCwgXCJzY3JvbGxcIiwgdGhpcy5vblNjcm9sbC5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGhlIHNjcm9sbCBiYXIsIHdlbGwsIHNjcm9sbHMuXG4gICAgICogQGV2ZW50IHNjcm9sbFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlIENvbnRhaW5zIG9uZSBwcm9wZXJ0eSwgYFwiZGF0YVwiYCwgd2hpY2ggaW5kaWNhdGVzIHRoZSBjdXJyZW50IHNjcm9sbCBsZWZ0IHBvc2l0aW9uXG4gICAgICovXG4gICAgb25TY3JvbGwoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5za2lwRXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMuX3Njcm9sbExlZnQgPSB0aGlzLmVsZW1lbnQuc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IHNjcm9sbFxuICAgICAgICAgICAgICogQHBhcmFtIFRPRE9cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcInNjcm9sbFwiLCB7IGRhdGE6IHRoaXMuX3Njcm9sbExlZnQgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5za2lwRXZlbnQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBoZWlnaHQgb2YgdGhlIHNjcm9sbCBiYXIuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmlzVmlzaWJsZSA/IHRoaXMuX2hlaWdodCA6IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgd2lkdGggb2YgdGhlIHNjcm9sbCBiYXIsIGluIHBpeGVscy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gd2lkdGggVGhlIG5ldyB3aWR0aFxuICAgICAqKi9cbiAgICBzZXRXaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZWxlbWVudC5zdHlsZS53aWR0aCA9IHdpZHRoICsgXCJweFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGlubmVyIHdpZHRoIG9mIHRoZSBzY3JvbGwgYmFyLCBpbiBwaXhlbHMuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHdpZHRoIFRoZSBuZXcgaW5uZXIgd2lkdGhcbiAgICAgKiBAZGVwcmVjYXRlZCBVc2Ugc2V0U2Nyb2xsV2lkdGggaW5zdGVhZFxuICAgICAqKi9cbiAgICBzZXRJbm5lcldpZHRoKHdpZHRoOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5pbm5lci5zdHlsZS53aWR0aCA9IHdpZHRoICsgXCJweFwiO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNjcm9sbCB3aWR0aCBvZiB0aGUgc2Nyb2xsIGJhciwgaW4gcGl4ZWxzLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB3aWR0aCBUaGUgbmV3IHNjcm9sbCB3aWR0aFxuICAgICAqKi9cbiAgICBzZXRTY3JvbGxXaWR0aCh3aWR0aDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuaW5uZXIuc3R5bGUud2lkdGggPSB3aWR0aCArIFwicHhcIjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzY3JvbGwgbGVmdCBvZiB0aGUgc2Nyb2xsIGJhci5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIGxlZnRcbiAgICAgKiovXG4gICAgLy8gb24gY2hyb21lIDE3KyBmb3Igc21hbGwgem9vbSBsZXZlbHMgYWZ0ZXIgY2FsbGluZyB0aGlzIGZ1bmN0aW9uXG4gICAgLy8gdGhpcy5lbGVtZW50LnNjcm9sbFRvcCAhPSBzY3JvbGxUb3Agd2hpY2ggbWFrZXMgcGFnZSB0byBzY3JvbGwgdXAuXG4gICAgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuX3Njcm9sbExlZnQgIT0gc2Nyb2xsTGVmdCkge1xuICAgICAgICAgICAgdGhpcy5za2lwRXZlbnQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5fc2Nyb2xsTGVmdCA9IHRoaXMuZWxlbWVudC5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==