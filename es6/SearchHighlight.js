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
