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
"use strict";

import Completion from "./Completion";

/**
 * @class CompletionList
 */
export default class CompletionList {

    /**
     * @property all
     * @type Completion[]
     * @private
     */
    private all: Completion[];

    /**
     * @property filtered
     * @type Completion[]
     */
    public filtered: Completion[];

    /**
     * @property filterText
     * @type string
     */
    public filterText: string;

    /**
     * @class CompletionList
     * @constructor
     * @param all {Completion[]}
     * @param [filterText] {string}
     */
    constructor(all: Completion[], filterText?: string) {
        this.all = all;
        this.filtered = all;
        this.filterText = filterText || "";
    }

    /**
     * Updates the <code>filtered</code> property of this list of completions.
     *
     * @method setFilter
     * @param filterText {string}
     * @return {void}
     */
    public setFilter(filterText: string): void {

        var matches: Completion[];

        if (filterText.length > this.filterText.length && filterText.lastIndexOf(this.filterText, 0) === 0) {
            matches = this.filtered;
        }
        else {
            matches = this.all;
        }

        this.filterText = filterText;

        matches = this.filterCompletions(matches, this.filterText);

        matches = matches.sort(function(a: Completion, b: Completion) {
            return b.exactMatch - a.exactMatch || b.score - a.score;
        });

        // make unique
        var prev: string = null;
        matches = matches.filter(function(item: Completion) {
            var caption = item.value || item.caption || item.snippet;
            if (caption === prev) return false;
            prev = caption;
            return true;
        });

        this.filtered = matches;
    }

    /**
     * @method filterCompletions
     * @param items {Completion[]}
     * @param needle {string}
     * @return {Completion[]}
     * @private
     */
    private filterCompletions(items: Completion[], needle: string): Completion[] {

        var results: Completion[] = [];
        var upper = needle.toUpperCase();
        var lower = needle.toLowerCase();

        loop: for (var i = 0, length = items.length; i < length; i++) {
            var item: Completion = items[i];
            var caption = item.value || item.caption || item.snippet;
            if (!caption) continue;
            var lastIndex = -1;
            var matchMask = 0;
            var penalty = 0;
            var index: number;
            var distance: number;
            // caption char iteration is faster in Chrome but slower in Firefox, so lets use indexOf
            for (var j = 0; j < needle.length; j++) {
                // TODO add penalty on case mismatch
                var i1 = caption.indexOf(lower[j], lastIndex + 1);
                var i2 = caption.indexOf(upper[j], lastIndex + 1);
                index = (i1 >= 0) ? ((i2 < 0 || i1 < i2) ? i1 : i2) : i2;
                if (index < 0)
                    continue loop;
                distance = index - lastIndex - 1;
                if (distance > 0) {
                    // first char mismatch should be more sensitive
                    if (lastIndex === -1)
                        penalty += 10;
                    penalty += distance;
                }
                matchMask = matchMask | (1 << index);
                lastIndex = index;
            }
            item.matchMask = matchMask;
            item.exactMatch = penalty ? 0 : 1;
            item.score = (item.score || 0) - penalty;
            results.push(item);
        }
        return results;
    }
}
