import FoldMode from "./FoldMode";
export default class MixedFoldMode extends FoldMode {
    constructor(defaultMode, subModes) {
        super();
        this.defaultMode = defaultMode;
        this.subModes = subModes;
    }
    $getMode(state) {
        if (typeof state != "string")
            state = state[0];
        for (var key in this.subModes) {
            if (state.indexOf(key) === 0)
                return this.subModes[key];
        }
        return null;
    }
    $tryMode(state, session, foldStyle, row) {
        var mode = this.$getMode(state);
        return (mode ? mode.getFoldWidget(session, foldStyle, row) : "");
    }
    getFoldWidget(session, foldStyle, row) {
        return (this.$tryMode(session.getState(row - 1), session, foldStyle, row) ||
            this.$tryMode(session.getState(row), session, foldStyle, row) ||
            this.defaultMode.getFoldWidget(session, foldStyle, row));
    }
    getFoldWidgetRange(session, foldStyle, row) {
        var mode = this.$getMode(session.getState(row - 1));
        if (!mode || !mode.getFoldWidget(session, foldStyle, row))
            mode = this.$getMode(session.getState(row));
        if (!mode || !mode.getFoldWidget(session, foldStyle, row))
            mode = this.defaultMode;
        return mode.getFoldWidgetRange(session, foldStyle, row);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWl4ZWRGb2xkTW9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tb2RlL2ZvbGRpbmcvTWl4ZWRGb2xkTW9kZS50cyJdLCJuYW1lcyI6WyJNaXhlZEZvbGRNb2RlIiwiTWl4ZWRGb2xkTW9kZS5jb25zdHJ1Y3RvciIsIk1peGVkRm9sZE1vZGUuJGdldE1vZGUiLCJNaXhlZEZvbGRNb2RlLiR0cnlNb2RlIiwiTWl4ZWRGb2xkTW9kZS5nZXRGb2xkV2lkZ2V0IiwiTWl4ZWRGb2xkTW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2UiXSwibWFwcGluZ3MiOiJPQThCTyxRQUFRLE1BQU0sWUFBWTtBQUVqQywyQ0FBMkMsUUFBUTtJQUcvQ0EsWUFBWUEsV0FBV0EsRUFBRUEsUUFBUUE7UUFDN0JDLE9BQU9BLENBQUNBO1FBQ1JBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLFdBQVdBLENBQUNBO1FBQy9CQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFDREQsUUFBUUEsQ0FBQ0EsS0FBS0E7UUFDVkUsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDekJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURGLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLE9BQU9BLEVBQUVBLFNBQVNBLEVBQUVBLEdBQUdBO1FBQ25DRyxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsRUFBRUEsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDckVBLENBQUNBO0lBRURILGFBQWFBLENBQUNBLE9BQU9BLEVBQUVBLFNBQVNBLEVBQUVBLEdBQUdBO1FBQ2pDSSxNQUFNQSxDQUFDQSxDQUNIQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxPQUFPQSxFQUFFQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQTtZQUNqRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsT0FBT0EsRUFBRUEsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLGFBQWFBLENBQUNBLE9BQU9BLEVBQUVBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQzFEQSxDQUFDQTtJQUNOQSxDQUFDQTtJQUVESixrQkFBa0JBLENBQUNBLE9BQU9BLEVBQUVBLFNBQVNBLEVBQUVBLEdBQUdBO1FBQ3RDSyxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVwREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsRUFBRUEsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBRWhEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxPQUFPQSxFQUFFQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7UUFFNUJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsT0FBT0EsRUFBRUEsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDNURBLENBQUNBO0FBQ0xMLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgRm9sZE1vZGUgZnJvbSBcIi4vRm9sZE1vZGVcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWl4ZWRGb2xkTW9kZSBleHRlbmRzIEZvbGRNb2RlIHtcbiAgICBkZWZhdWx0TW9kZTtcbiAgICBzdWJNb2RlcztcbiAgICBjb25zdHJ1Y3RvcihkZWZhdWx0TW9kZSwgc3ViTW9kZXMpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5kZWZhdWx0TW9kZSA9IGRlZmF1bHRNb2RlO1xuICAgICAgICB0aGlzLnN1Yk1vZGVzID0gc3ViTW9kZXM7XG4gICAgfVxuICAgICRnZXRNb2RlKHN0YXRlKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGUgIT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgIHN0YXRlID0gc3RhdGVbMF07XG4gICAgICAgIGZvciAodmFyIGtleSBpbiB0aGlzLnN1Yk1vZGVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaW5kZXhPZihrZXkpID09PSAwKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnN1Yk1vZGVzW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgJHRyeU1vZGUoc3RhdGUsIHNlc3Npb24sIGZvbGRTdHlsZSwgcm93KSB7XG4gICAgICAgIHZhciBtb2RlID0gdGhpcy4kZ2V0TW9kZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiAobW9kZSA/IG1vZGUuZ2V0Rm9sZFdpZGdldChzZXNzaW9uLCBmb2xkU3R5bGUsIHJvdykgOiBcIlwiKTtcbiAgICB9XG5cbiAgICBnZXRGb2xkV2lkZ2V0KHNlc3Npb24sIGZvbGRTdHlsZSwgcm93KSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICB0aGlzLiR0cnlNb2RlKHNlc3Npb24uZ2V0U3RhdGUocm93IC0gMSksIHNlc3Npb24sIGZvbGRTdHlsZSwgcm93KSB8fFxuICAgICAgICAgICAgdGhpcy4kdHJ5TW9kZShzZXNzaW9uLmdldFN0YXRlKHJvdyksIHNlc3Npb24sIGZvbGRTdHlsZSwgcm93KSB8fFxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0TW9kZS5nZXRGb2xkV2lkZ2V0KHNlc3Npb24sIGZvbGRTdHlsZSwgcm93KVxuICAgICAgICApO1xuICAgIH1cblxuICAgIGdldEZvbGRXaWRnZXRSYW5nZShzZXNzaW9uLCBmb2xkU3R5bGUsIHJvdykge1xuICAgICAgICB2YXIgbW9kZSA9IHRoaXMuJGdldE1vZGUoc2Vzc2lvbi5nZXRTdGF0ZShyb3cgLSAxKSk7XG5cbiAgICAgICAgaWYgKCFtb2RlIHx8ICFtb2RlLmdldEZvbGRXaWRnZXQoc2Vzc2lvbiwgZm9sZFN0eWxlLCByb3cpKVxuICAgICAgICAgICAgbW9kZSA9IHRoaXMuJGdldE1vZGUoc2Vzc2lvbi5nZXRTdGF0ZShyb3cpKTtcblxuICAgICAgICBpZiAoIW1vZGUgfHwgIW1vZGUuZ2V0Rm9sZFdpZGdldChzZXNzaW9uLCBmb2xkU3R5bGUsIHJvdykpXG4gICAgICAgICAgICBtb2RlID0gdGhpcy5kZWZhdWx0TW9kZTtcblxuICAgICAgICByZXR1cm4gbW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2Uoc2Vzc2lvbiwgZm9sZFN0eWxlLCByb3cpO1xuICAgIH1cbn1cbiJdfQ==