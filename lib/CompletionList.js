"use strict";
export default class CompletionList {
    constructor(all, filterText) {
        this.all = all;
        this.filtered = all;
        this.filterText = filterText || "";
    }
    setFilter(filterText) {
        var matches;
        if (filterText.length > this.filterText.length && filterText.lastIndexOf(this.filterText, 0) === 0) {
            matches = this.filtered;
        }
        else {
            matches = this.all;
        }
        this.filterText = filterText;
        matches = this.filterCompletions(matches, this.filterText);
        matches = matches.sort(function (a, b) {
            return b.exactMatch - a.exactMatch || b.score - a.score;
        });
        var prev = null;
        matches = matches.filter(function (item) {
            var caption = item.value || item.caption || item.snippet;
            if (caption === prev)
                return false;
            prev = caption;
            return true;
        });
        this.filtered = matches;
    }
    filterCompletions(items, needle) {
        var results = [];
        var upper = needle.toUpperCase();
        var lower = needle.toLowerCase();
        loop: for (var i = 0, length = items.length; i < length; i++) {
            var item = items[i];
            var caption = item.value || item.caption || item.snippet;
            if (!caption)
                continue;
            var lastIndex = -1;
            var matchMask = 0;
            var penalty = 0;
            var index;
            var distance;
            for (var j = 0; j < needle.length; j++) {
                var i1 = caption.indexOf(lower[j], lastIndex + 1);
                var i2 = caption.indexOf(upper[j], lastIndex + 1);
                index = (i1 >= 0) ? ((i2 < 0 || i1 < i2) ? i1 : i2) : i2;
                if (index < 0)
                    continue loop;
                distance = index - lastIndex - 1;
                if (distance > 0) {
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
