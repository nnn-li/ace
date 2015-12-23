"use strict";
import { getMatchOffsets } from "./lib/lang";
import Range from "./Range";
var MAX_RANGES = 500;
export default class SearchHighlight {
    constructor(regExp, clazz, type) {
        this.setRegexp(regExp);
        this.clazz = clazz;
        this.type = type || "text";
    }
    setRegexp(regExp) {
        if (this.regExp + "" == regExp + "") {
            return;
        }
        this.regExp = regExp;
        this.cache = [];
    }
    update(html, markerLayer, session, config) {
        if (!this.regExp)
            return;
        var start = config.firstRow, end = config.lastRow;
        for (var i = start; i <= end; i++) {
            var ranges = this.cache[i];
            if (ranges == null) {
                var matches = getMatchOffsets(session.getLine(i), this.regExp);
                if (matches.length > MAX_RANGES) {
                    matches = matches.slice(0, MAX_RANGES);
                }
                ranges = matches.map(function (match) {
                    return new Range(i, match.offset, i, match.offset + match.length);
                });
                this.cache[i] = ranges.length ? ranges : [];
            }
            for (var j = ranges.length; j--;) {
                markerLayer.drawSingleLineMarker(html, session.documentToScreenRange(ranges[j]), this.clazz, config);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VhcmNoSGlnaGxpZ2h0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU2VhcmNoSGlnaGxpZ2h0LnRzIl0sIm5hbWVzIjpbIlNlYXJjaEhpZ2hsaWdodCIsIlNlYXJjaEhpZ2hsaWdodC5jb25zdHJ1Y3RvciIsIlNlYXJjaEhpZ2hsaWdodC5zZXRSZWdleHAiLCJTZWFyY2hIaWdobGlnaHQudXBkYXRlIl0sIm1hcHBpbmdzIjoiQUFvREEsWUFBWSxDQUFDO09BRU4sRUFBRSxlQUFlLEVBQUUsTUFBTSxZQUFZO09BRXJDLEtBQUssTUFBTSxTQUFTO0FBTTNCLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQztBQUtyQjtJQWFJQSxZQUFZQSxNQUFjQSxFQUFFQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUNuREMsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ25CQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxJQUFJQSxNQUFNQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFNREQsU0FBU0EsQ0FBQ0EsTUFBY0E7UUFDcEJFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLElBQUlBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBVURGLE1BQU1BLENBQUNBLElBQXlCQSxFQUFFQSxXQUFtQkEsRUFBRUEsT0FBb0JBLEVBQUVBLE1BQW9CQTtRQUM3RkcsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDYkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFbERBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ2hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxPQUFPQSxHQUFHQSxlQUFlQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDL0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO29CQUM5QkEsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxDQUFDQTtnQkFDREEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsS0FBS0E7b0JBQy9CLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3RFLENBQUMsQ0FBQ0EsQ0FBQ0E7Z0JBRUhBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2hEQSxDQUFDQTtZQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQTtnQkFDL0JBLFdBQVdBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsT0FBT0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN6R0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7QUFDTEgsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgeyBnZXRNYXRjaE9mZnNldHMgfSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IER5bmFtaWNNYXJrZXIgZnJvbSBcIi4vRHluYW1pY01hcmtlclwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSBcIi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBNYXJrZXIgZnJvbSBcIi4vbGF5ZXIvTWFya2VyXCI7XG5pbXBvcnQgTWFya2VyQ29uZmlnIGZyb20gXCIuL2xheWVyL01hcmtlckNvbmZpZ1wiO1xuXG4vLyBuZWVkZWQgdG8gcHJldmVudCBsb25nIGxpbmVzIGZyb20gZnJlZXppbmcgdGhlIGJyb3dzZXJcbnZhciBNQVhfUkFOR0VTID0gNTAwO1xuXG4vKipcbiAqIEBjbGFzcyBTZWFyY2hIaWdobGlnaHRcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2VhcmNoSGlnaGxpZ2h0IGltcGxlbWVudHMgRHluYW1pY01hcmtlciB7XG4gICAgcHJpdmF0ZSByZWdFeHA6IFJlZ0V4cDtcbiAgICBwdWJsaWMgY2xheno6IHN0cmluZztcbiAgICBwdWJsaWMgdHlwZTogc3RyaW5nO1xuICAgIHByaXZhdGUgY2FjaGU6IFJhbmdlW11bXTtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBTZWFyY2hIaWdobGlnaHRcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gcmVnRXhwciB7UmVnRXhwfVxuICAgICAqIEBwYXJhbSBjbGF6eiB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSB0eXBlIHtzdHJpbmd9XG4gICAgICovXG4gICAgY29uc3RydWN0b3IocmVnRXhwOiBSZWdFeHAsIGNsYXp6OiBzdHJpbmcsIHR5cGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldFJlZ2V4cChyZWdFeHApO1xuICAgICAgICB0aGlzLmNsYXp6ID0gY2xheno7XG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGUgfHwgXCJ0ZXh0XCI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRSZWdleHBcbiAgICAgKiBAcGFyYW0gcmVnRXhwIHtSZWdFeHB9XG4gICAgICovXG4gICAgc2V0UmVnZXhwKHJlZ0V4cDogUmVnRXhwKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnJlZ0V4cCArIFwiXCIgPT0gcmVnRXhwICsgXCJcIikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVnRXhwID0gcmVnRXhwO1xuICAgICAgICB0aGlzLmNhY2hlID0gW107XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVcbiAgICAgKiBAcGFyYW0gaHRtbCB7KG51bWJlcnxzdHJpbmcpW119XG4gICAgICogQHBhcmFtIG1hcmtlckxheWVyIHtNYXJrZXJ9XG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBwYXJhbSBjb25maWcge01hcmtlckNvbmZpZ31cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHVwZGF0ZShodG1sOiAobnVtYmVyIHwgc3RyaW5nKVtdLCBtYXJrZXJMYXllcjogTWFya2VyLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgY29uZmlnOiBNYXJrZXJDb25maWcpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLnJlZ0V4cClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHN0YXJ0ID0gY29uZmlnLmZpcnN0Um93LCBlbmQgPSBjb25maWcubGFzdFJvdztcblxuICAgICAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSB0aGlzLmNhY2hlW2ldO1xuICAgICAgICAgICAgaWYgKHJhbmdlcyA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoZXMgPSBnZXRNYXRjaE9mZnNldHMoc2Vzc2lvbi5nZXRMaW5lKGkpLCB0aGlzLnJlZ0V4cCk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID4gTUFYX1JBTkdFUykge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzID0gbWF0Y2hlcy5zbGljZSgwLCBNQVhfUkFOR0VTKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmFuZ2VzID0gbWF0Y2hlcy5tYXAoZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShpLCBtYXRjaC5vZmZzZXQsIGksIG1hdGNoLm9mZnNldCArIG1hdGNoLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogVGhlIHplcm8tbGVuZ3RoIGNhc2Ugd2FzIHRoZSBlbXB0eSBzdHJpbmcsIGJ1dCB0aGF0IGRvZXMgbm90IHBhc3MgdGhlIGNvbXBpbGVyLlxuICAgICAgICAgICAgICAgIHRoaXMuY2FjaGVbaV0gPSByYW5nZXMubGVuZ3RoID8gcmFuZ2VzIDogW107XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAodmFyIGogPSByYW5nZXMubGVuZ3RoOyBqLS07KSB7XG4gICAgICAgICAgICAgICAgbWFya2VyTGF5ZXIuZHJhd1NpbmdsZUxpbmVNYXJrZXIoaHRtbCwgc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUmFuZ2UocmFuZ2VzW2pdKSwgdGhpcy5jbGF6eiwgY29uZmlnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbiJdfQ==