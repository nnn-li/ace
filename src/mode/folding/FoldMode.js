"use strict";
import Range from "../../Range";
export default class FoldMode {
    constructor() {
        this.foldingStartMarker = null;
        this.foldingStopMarker = null;
    }
    getFoldWidget(session, foldStyle, row) {
        var line = session.getLine(row);
        if (this.foldingStartMarker.test(line)) {
            return "start";
        }
        if (foldStyle === "markbeginend" && this.foldingStopMarker && this.foldingStopMarker.test(line)) {
            return "end";
        }
        return "";
    }
    getFoldWidgetRange(session, foldStyle, row) {
        return null;
    }
    indentationBlock(session, row, column) {
        var re = /\S/;
        var line = session.getLine(row);
        var startLevel = line.search(re);
        if (startLevel === -1) {
            return;
        }
        var startColumn = column || line.length;
        var maxRow = session.getLength();
        var startRow = row;
        var endRow = row;
        while (++row < maxRow) {
            var level = session.getLine(row).search(re);
            if (level === -1) {
                continue;
            }
            if (level <= startLevel) {
                break;
            }
            endRow = row;
        }
        if (endRow > startRow) {
            var endColumn = session.getLine(endRow).length;
            return new Range(startRow, startColumn, endRow, endColumn);
        }
    }
    openingBracketBlock(session, bracket, row, column, typeRe) {
        var start = { row: row, column: column + 1 };
        var end = session.findClosingBracket(bracket, start, typeRe);
        if (!end)
            return;
        var fw = session.foldWidgets[end.row];
        if (fw == null)
            fw = session.getFoldWidget(end.row);
        if (fw == "start" && end.row > start.row) {
            end.row--;
            end.column = session.getLine(end.row).length;
        }
        return Range.fromPoints(start, end);
    }
    closingBracketBlock(session, bracket, row, column, typeRe) {
        var end = { row: row, column: column };
        var start = session.findOpeningBracket(bracket, end);
        if (!start) {
            return;
        }
        start.column++;
        end.column--;
        return Range.fromPoints(start, end);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9sZE1vZGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJGb2xkTW9kZS50cyJdLCJuYW1lcyI6WyJGb2xkTW9kZSIsIkZvbGRNb2RlLmNvbnN0cnVjdG9yIiwiRm9sZE1vZGUuZ2V0Rm9sZFdpZGdldCIsIkZvbGRNb2RlLmdldEZvbGRXaWRnZXRSYW5nZSIsIkZvbGRNb2RlLmluZGVudGF0aW9uQmxvY2siLCJGb2xkTW9kZS5vcGVuaW5nQnJhY2tldEJsb2NrIiwiRm9sZE1vZGUuY2xvc2luZ0JyYWNrZXRCbG9jayJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEtBQUssTUFBTSxhQUFhO0FBTS9CO0lBa0JJQTtRQVpBQyx1QkFBa0JBLEdBQVdBLElBQUlBLENBQUNBO1FBTWxDQSxzQkFBaUJBLEdBQVdBLElBQUlBLENBQUNBO0lBT2pDQSxDQUFDQTtJQVdERCxhQUFhQSxDQUFDQSxPQUFvQkEsRUFBRUEsU0FBaUJBLEVBQUVBLEdBQVdBO1FBQzlERSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDbkJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEtBQUtBLGNBQWNBLElBQUlBLElBQUlBLENBQUNBLGlCQUFpQkEsSUFBSUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5RkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDakJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO0lBQ2RBLENBQUNBO0lBU0RGLGtCQUFrQkEs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QUdBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNWQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNqREEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBV0RMLG1CQUFtQkEsQ0FBQ0EsT0FBb0JBLEVBQUVBLE9BQWVBLEVBQUVBLEdBQVdBLEVBQUVBLE1BQWNBLEVBQUVBLE1BQWVBO1FBQ25HTSxJQUFJQSxHQUFHQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQTtRQUN2Q0EsSUFBSUEsS0FBS0EsR0FBR0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxPQUFPQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVyREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFFYkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0FBQ0xOLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiBcbiogKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCBSYW5nZSBmcm9tIFwiLi4vLi4vUmFuZ2VcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vLi4vRWRpdFNlc3Npb25cIjtcblxuLyoqXG4gKiBAY2xhc3MgRm9sZE1vZGVcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRm9sZE1vZGUge1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGZvbGRpbmdTdGFydE1hcmtlclxuICAgICAqIEB0eXBlIFJlZ0V4cFxuICAgICAqL1xuICAgIGZvbGRpbmdTdGFydE1hcmtlcjogUmVnRXhwID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBmb2xkaW5nU3RhcnRNYXJrZXJcbiAgICAgKiBAdHlwZSBSZWdFeHBcbiAgICAgKi9cbiAgICBmb2xkaW5nU3RvcE1hcmtlcjogUmVnRXhwID0gbnVsbDtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBGb2xkTW9kZVxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIG11c3QgcmV0dXJuIFwiXCIgaWYgdGhlcmUncyBubyBmb2xkLCB0byBlbmFibGUgY2FjaGluZ1xuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGb2xkV2lkZ2V0XG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBwYXJhbSBmb2xkU3R5bGUge3N0cmluZ30gXCJtYXJrYmVnaW5lbmRcIlxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0Rm9sZFdpZGdldChzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgZm9sZFN0eWxlOiBzdHJpbmcsIHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgaWYgKHRoaXMuZm9sZGluZ1N0YXJ0TWFya2VyLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBcInN0YXJ0XCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRTdHlsZSA9PT0gXCJtYXJrYmVnaW5lbmRcIiAmJiB0aGlzLmZvbGRpbmdTdG9wTWFya2VyICYmIHRoaXMuZm9sZGluZ1N0b3BNYXJrZXIudGVzdChsaW5lKSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiZW5kXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRGb2xkV2lkZ2V0UmFuZ2VcbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259XG4gICAgICogQHBhcmFtIGZvbGRTdHlsZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBnZXRGb2xkV2lkZ2V0UmFuZ2Uoc2Vzc2lvbjogRWRpdFNlc3Npb24sIGZvbGRTdHlsZTogc3RyaW5nLCByb3c6IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBpbmRlbnRhdGlvbkJsb2NrXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn1cbiAgICAgKiBAcGFyYW0gY29sdW1uIHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgaW5kZW50YXRpb25CbG9jayhzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgcm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgcmUgPSAvXFxTLztcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgdmFyIHN0YXJ0TGV2ZWwgPSBsaW5lLnNlYXJjaChyZSk7XG4gICAgICAgIGlmIChzdGFydExldmVsID09PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHN0YXJ0Q29sdW1uID0gY29sdW1uIHx8IGxpbmUubGVuZ3RoO1xuICAgICAgICB2YXIgbWF4Um93ID0gc2Vzc2lvbi5nZXRMZW5ndGgoKTtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gcm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gcm93O1xuXG4gICAgICAgIHdoaWxlICgrK3JvdyA8IG1heFJvdykge1xuICAgICAgICAgICAgdmFyIGxldmVsID0gc2Vzc2lvbi5nZXRMaW5lKHJvdykuc2VhcmNoKHJlKTtcblxuICAgICAgICAgICAgaWYgKGxldmVsID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGV2ZWwgPD0gc3RhcnRMZXZlbCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlbmRSb3cgPSByb3c7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZW5kUm93ID4gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgIHZhciBlbmRDb2x1bW4gPSBzZXNzaW9uLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHN0YXJ0Um93LCBzdGFydENvbHVtbiwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvcGVuaW5nQnJhY2tldEJsb2NrXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBwYXJhbSBicmFja2V0IHtzdHJpbmd9XG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBjb2x1bW4ge251bWJlcn1cbiAgICAgKiBAcGFyYW0gW3R5cGVSZV0ge1JlZ0V4cH1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBvcGVuaW5nQnJhY2tldEJsb2NrKHNlc3Npb246IEVkaXRTZXNzaW9uLCBicmFja2V0OiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdHlwZVJlPzogUmVnRXhwKTogUmFuZ2Uge1xuICAgICAgICB2YXIgc3RhcnQgPSB7IHJvdzogcm93LCBjb2x1bW46IGNvbHVtbiArIDEgfTtcbiAgICAgICAgdmFyIGVuZCA9IHNlc3Npb24uZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQsIHN0YXJ0LCB0eXBlUmUpO1xuICAgICAgICBpZiAoIWVuZClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgZncgPSBzZXNzaW9uLmZvbGRXaWRnZXRzW2VuZC5yb3ddO1xuICAgICAgICBpZiAoZncgPT0gbnVsbClcbiAgICAgICAgICAgIGZ3ID0gc2Vzc2lvbi5nZXRGb2xkV2lkZ2V0KGVuZC5yb3cpO1xuXG4gICAgICAgIGlmIChmdyA9PSBcInN0YXJ0XCIgJiYgZW5kLnJvdyA+IHN0YXJ0LnJvdykge1xuICAgICAgICAgICAgZW5kLnJvdy0tO1xuICAgICAgICAgICAgZW5kLmNvbHVtbiA9IHNlc3Npb24uZ2V0TGluZShlbmQucm93KS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFJhbmdlLmZyb21Qb2ludHMoc3RhcnQsIGVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBjbG9zaW5nQnJhY2tldEJsb2NrXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBwYXJhbSBicmFja2V0IHtzdHJpbmd9XG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBjb2x1bW4ge251bWJlcn1cbiAgICAgKiBAcGFyYW0gW3R5cGVSZV0ge1JlZ0V4cH1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBjbG9zaW5nQnJhY2tldEJsb2NrKHNlc3Npb246IEVkaXRTZXNzaW9uLCBicmFja2V0OiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdHlwZVJlPzogUmVnRXhwKTogUmFuZ2Uge1xuICAgICAgICB2YXIgZW5kID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgdmFyIHN0YXJ0ID0gc2Vzc2lvbi5maW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldCwgZW5kKTtcblxuICAgICAgICBpZiAoIXN0YXJ0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzdGFydC5jb2x1bW4rKztcbiAgICAgICAgZW5kLmNvbHVtbi0tO1xuXG4gICAgICAgIHJldHVybiBSYW5nZS5mcm9tUG9pbnRzKHN0YXJ0LCBlbmQpO1xuICAgIH1cbn1cbiJdfQ==