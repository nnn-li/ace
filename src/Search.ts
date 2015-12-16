/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
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
"use strict";

import { copyObject, escapeRegExp, getMatchOffsets } from "./lib/lang";
import { mixin } from "./lib/oop";
import Range from "./Range";
import EditSession from "./EditSession";

/**
 * A class designed to handle all sorts of text searches within a [[Document `Document`]].
 * @class Search
 */
export default class Search {
    $options;
    /**
     * Creates a new `Search` object. The following search options are avaliable:
     *
     * - `needle`: The string or regular expression you're looking for
     * - `backwards`: Whether to search backwards from where cursor currently is. Defaults to `false`.
     * - `wrap`: Whether to wrap the search back to the beginning when it hits the end. Defaults to `false`.
     * - `caseSensitive`: Whether the search ought to be case-sensitive. Defaults to `false`.
     * - `wholeWord`: Whether the search matches only on whole words. Defaults to `false`.
     * - `range`: The [[Range]] to search within. Set this to `null` for the whole document
     * - `regExp`: Whether the search is a regular expression or not. Defaults to `false`.
     * - `start`: The starting [[Range]] or cursor position to begin the search
     * - `skipCurrent`: Whether or not to include the current line in the search. Default to `false`.
     *
     * @class Search 
     * @constructor
     */
    constructor() {
        this.$options = {};
    }

    /**
     * Sets the search options via the `options` parameter.
     *
     * @method set
     * @param {Object} options An object containing all the new search properties.
     * @return {Search}
     * @chainable
     */
    set(options): Search {
        mixin(this.$options, options);
        return this;
    }

    /**
     * [Returns an object containing all the search options.]{: #Search.getOptions}
     *
     * @method getOptions
     * @return {Object}
     */
    getOptions() {
        return copyObject(this.$options);
    }
    
    /**
     * Sets the search options via the `options` parameter.
     *
     * @method setOptions
     * @param {Object} An object containing all the search properties.
     * @return {void}
     * @related Search.set
     */
    setOptions(options): void {
        this.$options = options;
    }

    /**
     * Searches for `options.needle`.
     * If found, this method returns the [[Range `Range`]] where the text first occurs.
     * If `options.backwards` is `true`, the search goes backwards in the session.
     *
     * @method find
     * @param {EditSession} session The session to search with.
     * @return {Range}
     */
    find(session: EditSession): Range {
        var iterator = this.$matchIterator(session, this.$options);

        if (!iterator) {
            return void 0;
        }

        var firstRange: Range = null;
        iterator.forEach(function(range, row, offset) {
            if (!range.start) {
                var column = range.offset + (offset || 0);
                firstRange = new Range(row, column, row, column + range.length);
            } else
                firstRange = range;
            return true;
        });

        return firstRange;
    }

    /**
     * Searches for all occurances `options.needle`.
     * If found, this method returns an array of [[Range `Range`s]] where the text first occurs.
     * If `options.backwards` is `true`, the search goes backwards in the session.
     *
     * @method findAll
     * @param {EditSession} session The session to search with.
     * @return {[Range]}
     */
    findAll(session: EditSession): Range[] {
        var options = this.$options;
        if (!options.needle)
            return [];
        this.$assembleRegExp(options);

        var range = options.range;
        var lines = range
            ? session.getLines(range.start.row, range.end.row)
            : session.doc.getAllLines();

        var ranges: Range[] = [];
        var re = options.re;
        if (options.$isMultiLine) {
            var len = re.length;
            var maxRow = lines.length - len;
            var prevRange;
            outer: for (var row = re.offset || 0; row <= maxRow; row++) {
                for (var j = 0; j < len; j++)
                    if (lines[row + j].search(re[j]) == -1)
                        continue outer;

                var startLine = lines[row];
                var line = lines[row + len - 1];
                var startIndex = startLine.length - startLine.match(re[0])[0].length;
                var endIndex = line.match(re[len - 1])[0].length;

                if (prevRange && prevRange.end.row === row &&
                    prevRange.end.column > startIndex
                ) {
                    continue;
                }
                ranges.push(prevRange = new Range(
                    row, startIndex, row + len - 1, endIndex
                ));
                if (len > 2)
                    row = row + len - 2;
            }
        }
        else {
            for (var i = 0; i < lines.length; i++) {
                var matches = getMatchOffsets(lines[i], re);
                for (var j = 0; j < matches.length; j++) {
                    var match = matches[j];
                    ranges.push(new Range(i, match.offset, i, match.offset + match.length));
                }
            }
        }

        if (range) {
            var startColumn = range.start.column;
            var endColumn = range.start.column;
            var i = 0, j = ranges.length - 1;
            while (i < j && ranges[i].start.column < startColumn && ranges[i].start.row == range.start.row)
                i++;

            while (i < j && ranges[j].end.column > endColumn && ranges[j].end.row == range.end.row)
                j--;

            ranges = ranges.slice(i, j + 1);
            for (i = 0, j = ranges.length; i < j; i++) {
                ranges[i].start.row += range.start.row;
                ranges[i].end.row += range.start.row;
            }
        }

        return ranges;
    }

    /**
     * Searches for `options.needle` in `input`, and, if found, replaces it with `replacement`.
     *
     * @method replace
     * @param {String} input The text to search in
     * @param {String} replacement The replacing text
     * + (String): If `options.regExp` is `true`, this function returns `input` with the replacement already made. Otherwise, this function just returns `replacement`.<br/>
     * If `options.needle` was not found, this function returns `null`.
     * @return {String}
     */
    replace(input: string, replacement: string): string {
        var options = this.$options;

        var re = this.$assembleRegExp(options);
        if (options.$isMultiLine)
            return replacement;

        if (!re)
            return;

        var match = re.exec(input);
        if (!match || match[0].length != input.length)
            return null;

        replacement = input.replace(re, replacement);
        if (options.preserveCase) {
            var parts: string[] = replacement.split("");
            for (var i = Math.min(input.length, input.length); i--;) {
                var ch = input[i];
                if (ch && ch.toLowerCase() != ch)
                    parts[i] = parts[i].toUpperCase();
                else
                    parts[i] = parts[i].toLowerCase();
            }
            replacement = parts.join("");
        }

        return replacement;
    }

    private $matchIterator(session: EditSession, options: { backwards: boolean; $isMultiLine: boolean }): any {
        var re = this.$assembleRegExp(options);
        if (!re)
            return false;

        var self = this, callback, backwards = options.backwards;

        if (options.$isMultiLine) {
            var len = re.length;
            var matchIterator = function(line, row, offset) {
                var startIndex = line.search(re[0]);
                if (startIndex == -1)
                    return;
                for (var i = 1; i < len; i++) {
                    line = session.getLine(row + i);
                    if (line.search(re[i]) == -1)
                        return;
                }

                var endIndex = line.match(re[len - 1])[0].length;

                var range = new Range(row, startIndex, row + len - 1, endIndex);
                if (re.offset == 1) {
                    range.start.row--;
                    range.start.column = Number.MAX_VALUE;
                } else if (offset)
                    range.start.column += offset;

                if (callback(range))
                    return true;
            };
        }
        else if (backwards) {
            var matchIterator = function(line, row, startIndex) {
                var matches = getMatchOffsets(line, re);
                for (var i = matches.length - 1; i >= 0; i--)
                    if (callback(matches[i], row, startIndex))
                        return true;
            };
        }
        else {
            var matchIterator = function(line, row, startIndex) {
                var matches = getMatchOffsets(line, re);
                for (var i = 0; i < matches.length; i++)
                    if (callback(matches[i], row, startIndex))
                        return true;
            };
        }

        return {
            forEach: function(_callback) {
                callback = _callback;
                self.$lineIterator(session, options).forEach(matchIterator);
            }
        };
    }

    // FIXME: Editor needs access.
    public $assembleRegExp(options, $disableFakeMultiline?: boolean) {
        if (options.needle instanceof RegExp)
            return options.re = options.needle;

        var needle = options.needle;

        if (!options.needle)
            return options.re = false;

        if (!options.regExp)
            needle = escapeRegExp(needle);

        if (options.wholeWord)
            needle = "\\b" + needle + "\\b";

        var modifier = options.caseSensitive ? "g" : "gi";

        options.$isMultiLine = !$disableFakeMultiline && /[\n\r]/.test(needle);
        if (options.$isMultiLine)
            return options.re = this.$assembleMultilineRegExp(needle, modifier);

        try {
            var re: any = new RegExp(needle, modifier);
        }
        catch (e) {
            re = false;
        }
        return options.re = re;
    }

    private $assembleMultilineRegExp(needle: string, modifier): RegExp[] {
        var parts = needle.replace(/\r\n|\r|\n/g, "$\n^").split("\n");
        var re: RegExp[] = [];
        for (var i = 0; i < parts.length; i++) {
            try {
                re.push(new RegExp(parts[i], modifier));
            }
            catch (e) {
                return void 0;
            }
        }
        if (parts[0] == "") {
            re.shift();
            re['offset'] = 1;
        }
        else {
            re['offset'] = 0;
        }
        return re;
    }

    private $lineIterator(session: EditSession, options) {
        var backwards = options.backwards == true;
        var skipCurrent = options.skipCurrent != false;

        var range = options.range;
        var start = options.start;
        if (!start)
            start = range ? range[backwards ? "end" : "start"] : session.getSelection().getRange();

        if (start.start)
            start = start[skipCurrent != backwards ? "end" : "start"];

        var firstRow = range ? range.start.row : 0;
        var lastRow = range ? range.end.row : session.getLength() - 1;

        var forEach = backwards ? function(callback) {
            var row = start.row;

            var line = session.getLine(row).substring(0, start.column);
            if (callback(line, row))
                return;

            for (row--; row >= firstRow; row--)
                if (callback(session.getLine(row), row))
                    return;

            if (options.wrap == false)
                return;

            for (row = lastRow, firstRow = start.row; row >= firstRow; row--)
                if (callback(session.getLine(row), row))
                    return;
        } : function(callback) {
            var row = start.row;

            var line = session.getLine(row).substr(start.column);
            if (callback(line, row, start.column))
                return;

            for (row = row + 1; row <= lastRow; row++)
                if (callback(session.getLine(row), row))
                    return;

            if (options.wrap == false)
                return;

            for (row = firstRow, lastRow = start.row; row <= lastRow; row++)
                if (callback(session.getLine(row), row))
                    return;
        };

        return { forEach: forEach };
    }
}
