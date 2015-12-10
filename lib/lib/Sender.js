import EventEmitterClass from './event_emitter';
export default class Sender extends EventEmitterClass {
    constructor(target) {
        super();
        this.target = target;
    }
    callback(data, callbackId) {
        this.target.postMessage({ type: "call", id: callbackId, data: data }, void 0);
    }
    emit(name, data) {
        this.target.postMessage({ type: "event", name: name, data: data }, void 0);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VuZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9TZW5kZXIudHMiXSwibmFtZXMiOlsiU2VuZGVyIiwiU2VuZGVyLmNvbnN0cnVjdG9yIiwiU2VuZGVyLmNhbGxiYWNrIiwiU2VuZGVyLmVtaXQiXSwibWFwcGluZ3MiOiJPQUFPLGlCQUFpQixNQUFNLGlCQUFpQjtBQU0vQyxvQ0FBb0MsaUJBQWlCO0lBRWpEQSxZQUFZQSxNQUFjQTtRQUN0QkMsT0FBT0EsQ0FBQ0E7UUFDUkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBRURELFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLFVBQWtCQTtRQUM3QkUsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsRUFBRUEsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbEZBLENBQUNBO0lBRURGLElBQUlBLENBQUNBLElBQVlBLEVBQUVBLElBQUtBO1FBQ3BCRyxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxPQUFPQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMvRUEsQ0FBQ0E7QUFDTEgsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tICcuL2V2ZW50X2VtaXR0ZXInO1xuXG4vKipcbiAqIFVzZWQgaW4gV2ViIFdvcmtlcnMuXG4gKiBVc2VzIHBvc3RNZXNzYWdlIHRvIGNvbW11bmljYXRlIHdpdGggYSB0YWdldCB3aW5kb3cuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNlbmRlciBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwcml2YXRlIHRhcmdldDogV2luZG93O1xuICAgIGNvbnN0cnVjdG9yKHRhcmdldDogV2luZG93KSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuICAgIH1cbiAgICAvLyBGSVhNRTogSSdtIG5vdCBzdXJlIHdoeSB3ZSBleHRlbmQgRXZlbnRFbWl0dGVyQ2xhc3M/IENvbnZlbmllbmNlP1xuICAgIGNhbGxiYWNrKGRhdGEsIGNhbGxiYWNrSWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnRhcmdldC5wb3N0TWVzc2FnZSh7IHR5cGU6IFwiY2FsbFwiLCBpZDogY2FsbGJhY2tJZCwgZGF0YTogZGF0YSB9LCB2b2lkIDApO1xuICAgIH1cbiAgICAvLyBGSVhNRTogSSdtIG5vdCBzdXJlIHdoeSB3ZSBleHRlbmQgRXZlbnRFbWl0dGVyQ2xhc3M/IENvbnZlbmllbmNlP1xuICAgIGVtaXQobmFtZTogc3RyaW5nLCBkYXRhPykge1xuICAgICAgICB0aGlzLnRhcmdldC5wb3N0TWVzc2FnZSh7IHR5cGU6IFwiZXZlbnRcIiwgbmFtZTogbmFtZSwgZGF0YTogZGF0YSB9LCB2b2lkIDApO1xuICAgIH1cbn0iXX0=