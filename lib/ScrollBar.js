import { createElement } from "./lib/dom";
import { addListener } from "./lib/event";
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
        addListener(this.element, "mousedown", event.preventDefault);
    }
    setVisible(isVisible) {
        this.element.style.display = isVisible ? "" : "none";
        this.isVisible = isVisible;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2Nyb2xsQmFyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1Njcm9sbEJhci50cyJdLCJuYW1lcyI6WyJTY3JvbGxCYXIiLCJTY3JvbGxCYXIuY29uc3RydWN0b3IiLCJTY3JvbGxCYXIuc2V0VmlzaWJsZSJdLCJtYXBwaW5ncyI6Ik9BNkJPLEVBQUUsYUFBYSxFQUFFLE1BQU0sV0FBVztPQUNsQyxFQUFFLFdBQVcsRUFBRSxNQUFNLGFBQWE7T0FDbEMsaUJBQWlCLE1BQU0scUJBQXFCO0FBTW5ELHVDQUF1QyxpQkFBaUI7SUFXcERBLFlBQVlBLE1BQW1CQSxFQUFFQSxXQUFtQkE7UUFDaERDLE9BQU9BLENBQUNBO1FBQ1JBLElBQUlBLENBQUNBLE9BQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsR0FBR0EsNkJBQTZCQSxHQUFHQSxXQUFXQSxDQUFDQTtRQUVyRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBbUJBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2xEQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxHQUFHQSxxQkFBcUJBLENBQUNBO1FBQzdDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUVyQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUV2QkEsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7SUFDakVBLENBQUNBO0lBQ0RELFVBQVVBLENBQUNBLFNBQVNBO1FBQ2hCRSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxHQUFHQSxTQUFTQSxHQUFHQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7SUFDL0JBLENBQUNBO0FBQ0xGLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuaW1wb3J0IHsgY3JlYXRlRWxlbWVudCB9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7IGFkZExpc3RlbmVyIH0gZnJvbSBcIi4vbGliL2V2ZW50XCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcblxuLyoqXG4gKiBBbiBhYnN0cmFjdCBjbGFzcyByZXByZXNlbnRpbmcgYSBuYXRpdmUgc2Nyb2xsYmFyIGNvbnRyb2wuXG4gKiBAY2xhc3MgU2Nyb2xsQmFyXG4gKiovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY3JvbGxCYXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIGVsZW1lbnQ6IEhUTUxEaXZFbGVtZW50O1xuICAgIHB1YmxpYyBpbm5lcjogSFRNTERpdkVsZW1lbnQ7XG4gICAgcHVibGljIGlzVmlzaWJsZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgc2tpcEV2ZW50OiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgYFNjcm9sbEJhcmAuIGBwYXJlbnRgIGlzIHRoZSBvd25lciBvZiB0aGUgc2Nyb2xsIGJhci5cbiAgICAgKiBAcGFyYW0ge0RPTUVsZW1lbnR9IHBhcmVudCBBIERPTSBlbGVtZW50IFxuICAgICAqXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICoqL1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQsIGNsYXNzU3VmZml4OiBzdHJpbmcpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSBcImFjZV9zY3JvbGxiYXIgYWNlX3Njcm9sbGJhclwiICsgY2xhc3NTdWZmaXg7XG5cbiAgICAgICAgdGhpcy5pbm5lciA9IDxIVE1MRGl2RWxlbWVudD5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0aGlzLmlubmVyLmNsYXNzTmFtZSA9IFwiYWNlX3Njcm9sbGJhci1pbm5lclwiO1xuICAgICAgICB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5pbm5lcik7XG5cbiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgdGhpcy5zZXRWaXNpYmxlKGZhbHNlKTtcbiAgICAgICAgdGhpcy5za2lwRXZlbnQgPSBmYWxzZTtcblxuICAgICAgICBhZGRMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIFwibW91c2Vkb3duXCIsIGV2ZW50LnByZXZlbnREZWZhdWx0KTtcbiAgICB9XG4gICAgc2V0VmlzaWJsZShpc1Zpc2libGUpIHtcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBpc1Zpc2libGUgPyBcIlwiIDogXCJub25lXCI7XG4gICAgICAgIHRoaXMuaXNWaXNpYmxlID0gaXNWaXNpYmxlO1xuICAgIH1cbn0gXG4iXX0=