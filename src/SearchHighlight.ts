/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

import { getMatchOffsets } from "./lib/lang";
import Range from "./Range";
import EditSession from "./EditSession";
import Marker from "./layer/Marker";

// needed to prevent long lines from freezing the browser
var MAX_RANGES = 500;

export default class SearchHighlight {
    private regExp: RegExp;
    public clazz: string;
    private type: string;
    private cache: Range[][];
    constructor(regExp: RegExp, clazz: string, type: string) {
        this.setRegexp(regExp);
        this.clazz = clazz;
        this.type = type || "text";
    }

    setRegexp(regExp: RegExp) {
        if (this.regExp + "" == regExp + "")
            return;
        this.regExp = regExp;
        this.cache = [];
    }

    update(html, markerLayer: Marker, session: EditSession, config: { firstRow: number; lastRow: number }) {
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
                ranges = matches.map(function(match) {
                    return new Range(i, match.offset, i, match.offset + match.length);
                });
                // TODO: The zero-length case was the empty string, but that does not pass the compiler.
                this.cache[i] = ranges.length ? ranges : [];
            }

            for (var j = ranges.length; j--;) {
                markerLayer.drawSingleLineMarker(
                    html, session.documentToScreenRange(ranges[j]), this.clazz, config);
            }
        }
    }
}