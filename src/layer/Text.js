"use strict";
import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import EventEmitterClass from "../lib/EventEmitterClass";
export default class Text {
    constructor(container) {
        this.element = createElement("div");
        this.$padding = 0;
        this.EOF_CHAR = "\xB6";
        this.EOL_CHAR_LF = "\xAC";
        this.EOL_CHAR_CRLF = "\xa4";
        this.TAB_CHAR = "\u2192";
        this.SPACE_CHAR = "\xB7";
        this.showInvisibles = false;
        this.displayIndentGuides = true;
        this.$tabStrings = [];
        this.$textToken = { "text": true, "rparen": true, "lparen": true };
        this.eventBus = new EventEmitterClass(this);
        this.element.className = "ace_layer ace_text-layer";
        container.appendChild(this.element);
        this.EOL_CHAR = this.EOL_CHAR_LF;
    }
    updateEolChar() {
        var EOL_CHAR = this.session.doc.getNewLineCharacter() === "\n"
            ? this.EOL_CHAR_LF
            : this.EOL_CHAR_CRLF;
        if (this.EOL_CHAR != EOL_CHAR) {
            this.EOL_CHAR = EOL_CHAR;
            return true;
        }
        else {
            return false;
        }
    }
    setPadding(padding) {
        this.$padding = padding;
        this.element.style.padding = "0 " + padding + "px";
    }
    getLineHeight() {
        return this.$fontMetrics.$characterSize.height || 0;
    }
    getCharacterWidth() {
        return this.$fontMetrics.$characterSize.width || 0;
    }
    $setFontMetrics(measure) {
        this.$fontMetrics = measure;
        this.$fontMetrics.on("changeCharacterSize", (e) => {
            this.eventBus._signal("changeCharacterSize", e);
        });
        this.$pollSizeChanges();
    }
    checkForSizeChanges() {
        this.$fontMetrics.checkForSizeChanges();
    }
    $pollSizeChanges() {
        return this.$pollSizeChangesTimer = this.$fontMetrics.$pollSizeChanges();
    }
    setSession(session) {
        this.session = session;
        this.$computeTabString();
    }
    setShowInvisibles(showInvisibles) {
        if (this.showInvisibles === showInvisibles) {
            return false;
        }
        else {
            this.showInvisibles = showInvisibles;
            this.$computeTabString();
            return true;
        }
    }
    setDisplayIndentGuides(displayIndentGuides) {
        if (this.displayIndentGuides === displayIndentGuides) {
            return false;
        }
        else {
            this.displayIndentGuides = displayIndentGuides;
            this.$computeTabString();
            return true;
        }
    }
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
    }
    onChangeTabSize() {
        this.$computeTabString();
    }
    $computeTabString() {
        var tabSize = this.session.getTabSize();
        this.tabSize = tabSize;
        var tabStr = this.$tabStrings = ["0"];
        for (var i = 1; i < tabSize + 1; i++) {
            if (this.showInvisibles) {
                tabStr.push("<span class='ace_invisible ace_invisible_tab'>"
                    + this.TAB_CHAR
                    + stringRepeat("\xa0", i - 1)
                    + "</span>");
            }
            else {
                tabStr.push(stringRepeat("\xa0", i));
            }
        }
        if (this.displayIndentGuides) {
            this.$indentGuideRe = /\s\S| \t|\t |\s$/;
            var className = "ace_indent-guide";
            var spaceClass = "";
            var tabClass = "";
            if (this.showInvisibles) {
                className += " ace_invisible";
                spaceClass = " ace_invisible_space";
                tabClass = " ace_invisible_tab";
                var spaceContent = stringRepeat(this.SPACE_CHAR, this.tabSize);
                var tabContent = this.TAB_CHAR + stringRepeat("\xa0", this.tabSize - 1);
            }
            else {
                var spaceContent = stringRepeat("\xa0", this.tabSize);
                var tabContent = spaceContent;
            }
            this.$tabStrings[" "] = "<span class='" + className + spaceClass + "'>" + spaceContent + "</span>";
            this.$tabStrings["\t"] = "<span class='" + className + tabClass + "'>" + tabContent + "</span>";
        }
    }
    updateLines(config, firstRow, lastRow) {
        if (this.config.lastRow != config.lastRow ||
            this.config.firstRow != config.firstRow) {
            this.scrollLines(config);
        }
        this.config = config;
        var first = Math.max(firstRow, config.firstRow);
        var last = Math.min(lastRow, config.lastRow);
        var lineElements = this.element.childNodes;
        var lineElementsIdx = 0;
        for (var row = config.firstRow; row < first; row++) {
            var foldLine = this.session.getFoldLine(row);
            if (foldLine) {
                if (foldLine.containsRow(first)) {
                    first = foldLine.start.row;
                    break;
                }
                else {
                    row = foldLine.end.row;
                }
            }
            lineElementsIdx++;
        }
        var row = first;
        var foldLine = this.session.getNextFoldLine(row);
        var foldStart = foldLine ? foldLine.start.row : Infinity;
        while (true) {
            if (row > foldStart) {
                row = foldLine.end.row + 1;
                foldLine = this.session.getNextFoldLine(row, foldLine);
                foldStart = foldLine ? foldLine.start.row : Infinity;
            }
            if (row > last)
                break;
            var lineElement = lineElements[lineElementsIdx++];
            if (lineElement) {
                var html = [];
                this.$renderLine(html, row, !this.$useLineGroups(), row == foldStart ? foldLine : false);
                lineElement.style.height = config.lineHeight * this.session.getRowLength(row) + "px";
                lineElement.innerHTML = html.join("");
            }
            row++;
        }
    }
    scrollLines(config) {
        var oldConfig = this.config;
        this.config = config;
        if (!oldConfig || oldConfig.lastRow < config.firstRow)
            return this.update(config);
        if (config.lastRow < oldConfig.firstRow)
            return this.update(config);
        var el = this.element;
        if (oldConfig.firstRow < config.firstRow) {
            for (var row = this.session['getFoldedRowCount'](oldConfig.firstRow, config.firstRow - 1); row > 0; row--) {
                el.removeChild(el.firstChild);
            }
        }
        if (oldConfig.lastRow > config.lastRow) {
            for (var row = this.session['getFoldedRowCount'](config.lastRow + 1, oldConfig.lastRow); row > 0; row--) {
                el.removeChild(el.lastChild);
            }
        }
        if (config.firstRow < oldConfig.firstRow) {
            var fragment = this.$renderLinesFragment(config, config.firstRow, oldConfig.firstRow - 1);
            if (el.firstChild)
                el.insertBefore(fragment, el.firstChild);
            else
                el.appendChild(fragment);
        }
        if (config.lastRow > oldConfig.lastRow) {
            var fragment = this.$renderLinesFragment(config, oldConfig.lastRow + 1, config.lastRow);
            el.appendChild(fragment);
        }
    }
    $renderLinesFragment(config, firstRow, lastRow) {
        var fragment = this.element.ownerDocument.createDocumentFragment();
        var row = firstRow;
        var foldLine = this.session.getNextFoldLine(row);
        var foldStart = foldLine ? foldLine.start.row : Infinity;
        while (true) {
            if (row > foldStart) {
                row = foldLine.end.row + 1;
                foldLine = this.session.getNextFoldLine(row, foldLine);
                foldStart = foldLine ? foldLine.start.row : Infinity;
            }
            if (row > lastRow)
                break;
            var container = createElement("div");
            var html = [];
            this.$renderLine(html, row, false, row == foldStart ? foldLine : false);
            container.innerHTML = html.join("");
            if (this.$useLineGroups()) {
                container.className = 'ace_line_group';
                fragment.appendChild(container);
                container.style.height = config.lineHeight * this.session.getRowLength(row) + "px";
            }
            else {
                while (container.firstChild)
                    fragment.appendChild(container.firstChild);
            }
            row++;
        }
        return fragment;
    }
    update(config) {
        this.config = config;
        var html = [];
        var firstRow = config.firstRow, lastRow = config.lastRow;
        var row = firstRow;
        var foldLine = this.session.getNextFoldLine(row);
        var foldStart = foldLine ? foldLine.start.row : Infinity;
        while (true) {
            if (row > foldStart) {
                row = foldLine.end.row + 1;
                foldLine = this.session.getNextFoldLine(row, foldLine);
                foldStart = foldLine ? foldLine.start.row : Infinity;
            }
            if (row > lastRow)
                break;
            if (this.$useLineGroups())
                html.push("<div class='ace_line_group' style='height:", config.lineHeight * this.session.getRowLength(row), "px'>");
            this.$renderLine(html, row, false, row == foldStart ? foldLine : false);
            if (this.$useLineGroups())
                html.push("</div>");
            row++;
        }
        this.element.innerHTML = html.join("");
    }
    $renderToken(stringBuilder, screenColumn, token, value) {
        var self = this;
        var replaceReg = /\t|&|<|( +)|([\x00-\x1f\x80-\xa0\u1680\u180E\u2000-\u200f\u2028\u2029\u202F\u205F\u3000\uFEFF])|[\u1100-\u115F\u11A3-\u11A7\u11FA-\u11FF\u2329-\u232A\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFB\u3000-\u303E\u3041-\u3096\u3099-\u30FF\u3105-\u312D\u3131-\u318E\u3190-\u31BA\u31C0-\u31E3\u31F0-\u321E\u3220-\u3247\u3250-\u32FE\u3300-\u4DBF\u4E00-\uA48C\uA490-\uA4C6\uA960-\uA97C\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFF01-\uFF60\uFFE0-\uFFE6]/g;
        var replaceFunc = function (c, a, b, tabIdx, idx4) {
            if (a) {
                return self.showInvisibles ?
                    "<span class='ace_invisible ace_invisible_space'>" + stringRepeat(self.SPACE_CHAR, c.length) + "</span>" :
                    stringRepeat("\xa0", c.length);
            }
            else if (c == "&") {
                return "&#38;";
            }
            else if (c == "<") {
                return "&#60;";
            }
            else if (c == "\t") {
                var tabSize = self.session.getScreenTabSize(screenColumn + tabIdx);
                screenColumn += tabSize - 1;
                return self.$tabStrings[tabSize];
            }
            else if (c == "\u3000") {
                var classToUse = self.showInvisibles ? "ace_cjk ace_invisible ace_invisible_space" : "ace_cjk";
                var space = self.showInvisibles ? self.SPACE_CHAR : "";
                screenColumn += 1;
                return "<span class='" + classToUse + "' style='width:" +
                    (self.config.characterWidth * 2) +
                    "px'>" + space + "</span>";
            }
            else if (b) {
                return "<span class='ace_invisible ace_invisible_space ace_invalid'>" + self.SPACE_CHAR + "</span>";
            }
            else {
                screenColumn += 1;
                return "<span class='ace_cjk' style='width:" +
                    (self.config.characterWidth * 2) +
                    "px'>" + c + "</span>";
            }
        };
        var output = value.replace(replaceReg, replaceFunc);
        if (!this.$textToken[token.type]) {
            var classes = "ace_" + token.type.replace(/\./g, " ace_");
            var style = "";
            if (token.type == "fold")
                style = " style='width:" + (token.value.length * this.config.characterWidth) + "px;' ";
            stringBuilder.push("<span class='", classes, "'", style, ">", output, "</span>");
        }
        else {
            stringBuilder.push(output);
        }
        return screenColumn + value.length;
    }
    renderIndentGuide(stringBuilder, value, max) {
        var cols = value.search(this.$indentGuideRe);
        if (cols <= 0 || cols >= max)
            return value;
        if (value[0] === " ") {
            cols -= cols % this.tabSize;
            stringBuilder.push(stringRepeat(this.$tabStrings[" "], cols / this.tabSize));
            return value.substr(cols);
        }
        else if (value[0] == "\t") {
            stringBuilder.push(stringRepeat(this.$tabStrings["\t"], cols));
            return value.substr(cols);
        }
        return value;
    }
    $renderWrappedLine(stringBuilder, tokens, splits, onlyContents) {
        var chars = 0;
        var split = 0;
        var splitChars = splits[0];
        var screenColumn = 0;
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            var value = token.value;
            if (i == 0 && this.displayIndentGuides) {
                chars = value.length;
                value = this.renderIndentGuide(stringBuilder, value, splitChars);
                if (!value)
                    continue;
                chars -= value.length;
            }
            if (chars + value.length < splitChars) {
                screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
                chars += value.length;
            }
            else {
                while (chars + value.length >= splitChars) {
                    screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value.substring(0, splitChars - chars));
                    value = value.substring(splitChars - chars);
                    chars = splitChars;
                    if (!onlyContents) {
                        stringBuilder.push("</div>", "<div class='ace_line' style='height:", this.config.lineHeight, "px'>");
                    }
                    split++;
                    screenColumn = 0;
                    splitChars = splits[split] || Number.MAX_VALUE;
                }
                if (value.length != 0) {
                    chars += value.length;
                    screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
                }
            }
        }
    }
    $renderSimpleLine(stringBuilder, tokens) {
        var screenColumn = 0;
        var token = tokens[0];
        var value = token.value;
        if (this.displayIndentGuides)
            value = this.renderIndentGuide(stringBuilder, value);
        if (value)
            screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
        for (var i = 1; i < tokens.length; i++) {
            token = tokens[i];
            value = token.value;
            screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
        }
    }
    $renderLine(stringBuilder, row, onlyContents, foldLine) {
        if (!foldLine && foldLine != false) {
            foldLine = this.session.getFoldLine(row);
        }
        if (foldLine)
            var tokens = this.$getFoldLineTokens(row, foldLine);
        else
            var tokens = this.session.getTokens(row);
        if (!onlyContents) {
            stringBuilder.push("<div class='ace_line' style='height:", this.config.lineHeight * (this.$useLineGroups() ? 1 : this.session.getRowLength(row)), "px'>");
        }
        if (tokens && tokens.length) {
            var splits = this.session.getRowSplitData(row);
            if (splits && splits.length)
                this.$renderWrappedLine(stringBuilder, tokens, splits, onlyContents);
            else
                this.$renderSimpleLine(stringBuilder, tokens);
        }
        if (this.showInvisibles) {
            if (foldLine)
                row = foldLine.end.row;
            stringBuilder.push("<span class='ace_invisible ace_invisible_eol'>", row == this.session.getLength() - 1 ? this.EOF_CHAR : this.EOL_CHAR, "</span>");
        }
        if (!onlyContents)
            stringBuilder.push("</div>");
    }
    $getFoldLineTokens(row, foldLine) {
        var session = this.session;
        var renderTokens = [];
        function addTokens(tokens, from, to) {
            var idx = 0, col = 0;
            while ((col + tokens[idx].value.length) < from) {
                col += tokens[idx].value.length;
                idx++;
                if (idx == tokens.length)
                    return;
            }
            if (col != from) {
                var value = tokens[idx].value.substring(from - col);
                if (value.length > (to - from))
                    value = value.substring(0, to - from);
                renderTokens.push({
                    type: tokens[idx].type,
                    value: value
                });
                col = from + value.length;
                idx += 1;
            }
            while (col < to && idx < tokens.length) {
                var value = tokens[idx].value;
                if (value.length + col > to) {
                    renderTokens.push({
                        type: tokens[idx].type,
                        value: value.substring(0, to - col)
                    });
                }
                else
                    renderTokens.push(tokens[idx]);
                col += value.length;
                idx += 1;
            }
        }
        var tokens = session.getTokens(row);
        foldLine.walk(function (placeholder, row, column, lastColumn, isNewRow) {
            if (placeholder != null) {
                renderTokens.push({
                    type: "fold",
                    value: placeholder
                });
            }
            else {
                if (isNewRow)
                    tokens = session.getTokens(row);
                if (tokens.length)
                    addTokens(tokens, lastColumn, column);
            }
        }, foldLine.end.row, this.session.getLine(foldLine.end.row).length);
        return renderTokens;
    }
    $useLineGroups() {
        return this.session.getUseWrapMode();
    }
    destroy() {
        clearInterval(this.$pollSizeChangesTimer);
        if (this.$measureNode) {
            this.$measureNode.parentNode.removeChild(this.$measureNode);
        }
        delete this.$measureNode;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlRleHQudHMiXSwibmFtZXMiOlsiVGV4dCIsIlRleHQuY29uc3RydWN0b3IiLCJUZXh0LnVwZGF0ZUVvbENoYXIiLCJUZXh0LnNldFBhZGRpbmciLCJUZXh0LmdldExpbmVIZWlnaHQiLCJUZXh0LmdldENoYXJhY3RlcldpZHRoIiwiVGV4dC4kc2V0Rm9udE1ldHJpY3MiLCJUZXh0LmNoZWNrRm9yU2l6ZUNoYW5nZXMiLCJUZXh0LiRwb2xsU2l6ZUNoYW5nZXMiLCJUZXh0LnNldFNlc3Npb24iLCJUZXh0LnNldFNob3dJbnZpc2libGVzIiwiVGV4dC5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiVGV4dC5vbiIsIlRleHQub2ZmIiwiVGV4dC5vbkNoYW5nZVRhYlNpemUiLCJUZXh0LiRjb21wdXRlVGFiU3RyaW5nIiwiVGV4dC51cGRhdGVMaW5lcyIsIlRleHQuc2Nyb2xsTGluZXMiLCJUZXh0LiRyZW5kZXJMaW5lc0ZyYWdtZW50IiwiVGV4dC51cGRhdGUiLCJUZXh0LiRyZW5kZXJUb2tlbiIsIlRleHQucmVuZGVySW5kZW50R3VpZGUiLCJUZXh0LiRyZW5kZXJXcmFwcGVkTGluZSIsIlRleHQuJHJlbmRlclNpbXBsZUxpbmUiLCJUZXh0LiRyZW5kZXJMaW5lIiwiVGV4dC4kZ2V0Rm9sZExpbmVUb2tlbnMiLCJUZXh0LiRnZXRGb2xkTGluZVRva2Vucy5hZGRUb2tlbnMiLCJUZXh0LiR1c2VMaW5lR3JvdXBzIiwiVGV4dC5kZXN0cm95Il0sIm1hcHBpbmdzIjoiQUFvREEsWUFBWSxDQUFDO09BRU4sRUFBQyxhQUFhLEVBQUMsTUFBTSxZQUFZO09BQ2pDLEVBQUMsWUFBWSxFQUFDLE1BQU0sYUFBYTtPQUdqQyxpQkFBaUIsTUFBTSwwQkFBMEI7QUFReEQ7SUEyQklBLFlBQVlBLFNBQXNCQTtRQTFCM0JDLFlBQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM5Q0EsYUFB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LE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9CQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNwQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUV2Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDeEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdEdBLEVBQUVBLENB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QTtRQUV6REEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDM0JBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUN2REEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDekRBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBO2dCQUNkQSxLQUFLQSxDQUFDQTtZQUVWQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLDRDQUE0Q0EsRUFBRUEsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQUE7WUFFdkhBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLEdBQUdBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBO1lBRXhFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBRXhCQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNWQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFT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QUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUM1QkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0VBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFFT3JCLGtCQUFrQkEsQ0FBQ0EsYUFBa0NBLEVBQUVBLE1BQWVBLEVBQUVBLE1BQWdCQSxFQUFFQSxZQUFZQTtRQUMxR3NCLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLFVBQVVBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzNCQSxJQUFJQSxZQUFZQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFB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QUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUVwRUEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBRU96QixjQUFjQTtRQU1sQjJCLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQU1NM0IsT0FBT0E7UUFDVjRCLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0E7UUFDREEsT0FBT0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDN0JBLENBQUNBO0FBQ0w1QixDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTYgRGF2aWQgR2VvIEhvbG1lcyA8ZGF2aWQuZ2VvLmhvbG1lc0BnbWFpbC5jb20+XG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7Y3JlYXRlRWxlbWVudH0gZnJvbSBcIi4uL2xpYi9kb21cIjtcbmltcG9ydCB7c3RyaW5nUmVwZWF0fSBmcm9tIFwiLi4vbGliL2xhbmdcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBFdmVudEJ1cyBmcm9tIFwiLi9FdmVudEJ1c1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuLi9saWIvRXZlbnRFbWl0dGVyQ2xhc3NcIjtcbmltcG9ydCBGb2xkTGluZSBmcm9tIFwiLi4vRm9sZExpbmVcIjtcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBUb2tlbiBmcm9tIFwiLi4vVG9rZW5cIjtcblxuLyoqXG4gKiBAY2xhc3MgVGV4dFxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUZXh0IGltcGxlbWVudHMgRXZlbnRCdXM8VGV4dD4ge1xuICAgIHB1YmxpYyBlbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcHJpdmF0ZSAkcGFkZGluZyA9IDA7XG4gICAgcHJpdmF0ZSBFT0ZfQ0hBUiA9IFwiXFx4QjZcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSX0xGID0gXCJcXHhBQ1wiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfQ1JMRiA9IFwiXFx4YTRcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBUQUJfQ0hBUiA9IFwiXFx1MjE5MlwiOyAvL1wiXFx1MjFFNVwiO1xuICAgIHByaXZhdGUgU1BBQ0VfQ0hBUiA9IFwiXFx4QjdcIjtcbiAgICBwcml2YXRlICRmb250TWV0cmljczogRm9udE1ldHJpY3M7XG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlICRwb2xsU2l6ZUNoYW5nZXNUaW1lcjogbnVtYmVyO1xuICAgIHByaXZhdGUgc2hvd0ludmlzaWJsZXMgPSBmYWxzZTtcbiAgICBwcml2YXRlIGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHByaXZhdGUgJHRhYlN0cmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSAkdGV4dFRva2VuID0geyBcInRleHRcIjogdHJ1ZSwgXCJycGFyZW5cIjogdHJ1ZSwgXCJscGFyZW5cIjogdHJ1ZSB9O1xuICAgIHByaXZhdGUgdGFiU2l6ZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJGluZGVudEd1aWRlUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgY29uZmlnO1xuICAgIHByaXZhdGUgJG1lYXN1cmVOb2RlOiBOb2RlO1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPFRleHQ+O1xuXG4gICAgLyoqXG4gICAgICogQGNsYXNzIFRleHRcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gY29udGFpbmVyIHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8VGV4dD4odGhpcyk7XG4gICAgICAgIHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSBcImFjZV9sYXllciBhY2VfdGV4dC1sYXllclwiO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICAgICAgdGhpcy5FT0xfQ0hBUiA9IHRoaXMuRU9MX0NIQVJfTEY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVFb2xDaGFyXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICB1cGRhdGVFb2xDaGFyKCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgRU9MX0NIQVIgPSB0aGlzLnNlc3Npb24uZG9jLmdldE5ld0xpbmVDaGFyYWN0ZXIoKSA9PT0gXCJcXG5cIlxuICAgICAgICAgICAgPyB0aGlzLkVPTF9DSEFSX0xGXG4gICAgICAgICAgICA6IHRoaXMuRU9MX0NIQVJfQ1JMRjtcbiAgICAgICAgaWYgKHRoaXMuRU9MX0NIQVIgIT0gRU9MX0NIQVIpIHtcbiAgICAgICAgICAgIHRoaXMuRU9MX0NIQVIgPSBFT0xfQ0hBUjtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IFwiMCBcIiArIHBhZGRpbmcgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldExpbmVIZWlnaHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS5oZWlnaHQgfHwgMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q2hhcmFjdGVyV2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS53aWR0aCB8fCAwO1xuICAgIH1cblxuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MobWVhc3VyZTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBtZWFzdXJlO1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5vbihcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgKGUpID0+IHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUNoYXJhY3RlclNpemVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuJHBvbGxTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjaGVja0ZvclNpemVDaGFuZ2VzKCkge1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIgPSB0aGlzLiRmb250TWV0cmljcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgPT09IHNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNob3dJbnZpc2libGVzID0gc2hvd0ludmlzaWJsZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMgPT09IGRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheUluZGVudEd1aWRlcyA9IGRpc3BsYXlJbmRlbnRHdWlkZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVGV4dCkgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb24oZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBUZXh0KSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVGV4dCkgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVGV4dCkgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub2ZmKGV2ZW50TmFtZSwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8vIEZJWE1FOiBER0ggQ2hlY2sgdGhhdCB0aGlzIGlzIGNvbnNpc3RlbnQgd2l0aCBBQ0VcbiAgICBwdWJsaWMgb25DaGFuZ2VUYWJTaXplKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKClcbiAgICB9XG5cbiAgICAvLyAgICB0aGlzLm9uQ2hhbmdlVGFiU2l6ZSA9XG4gICAgcHJpdmF0ZSAkY29tcHV0ZVRhYlN0cmluZygpOiB2b2lkIHtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB0aGlzLnRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICB2YXIgdGFiU3RyID0gdGhpcy4kdGFiU3RyaW5ncyA9IFtcIjBcIl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGFiU2l6ZSArIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgICAgICB0YWJTdHIucHVzaChcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfdGFiJz5cIlxuICAgICAgICAgICAgICAgICAgICArIHRoaXMuVEFCX0NIQVJcbiAgICAgICAgICAgICAgICAgICAgKyBzdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCBpIC0gMSlcbiAgICAgICAgICAgICAgICAgICAgKyBcIjwvc3Bhbj5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICB0aGlzLiRpbmRlbnRHdWlkZVJlID0gL1xcc1xcU3wgXFx0fFxcdCB8XFxzJC87XG4gICAgICAgICAgICB2YXIgY2xhc3NOYW1lID0gXCJhY2VfaW5kZW50LWd1aWRlXCI7XG4gICAgICAgICAgICB2YXIgc3BhY2VDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICB2YXIgdGFiQ2xhc3MgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgKz0gXCIgYWNlX2ludmlzaWJsZVwiO1xuICAgICAgICAgICAgICAgIHNwYWNlQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3NwYWNlXCI7XG4gICAgICAgICAgICAgICAgdGFiQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3RhYlwiO1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZUNvbnRlbnQgPSBzdHJpbmdSZXBlYXQodGhpcy5TUEFDRV9DSEFSLCB0aGlzLnRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50ID0gdGhpcy5UQUJfQ0hBUiArIHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIHRoaXMudGFiU2l6ZSAtIDEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2VDb250ZW50ID0gc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgdGhpcy50YWJTaXplKTtcbiAgICAgICAgICAgICAgICB2YXIgdGFiQ29udGVudCA9IHNwYWNlQ29udGVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIiBcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHNwYWNlQ2xhc3MgKyBcIic+XCIgKyBzcGFjZUNvbnRlbnQgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIHRoaXMuJHRhYlN0cmluZ3NbXCJcXHRcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHRhYkNsYXNzICsgXCInPlwiICsgdGFiQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUxpbmVzKGNvbmZpZzogeyBmaXJzdFJvdzogbnVtYmVyOyBsYXN0Um93OiBudW1iZXI7IGxpbmVIZWlnaHQ6IG51bWJlciB9LCBmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gRHVlIHRvIHdyYXAgbGluZSBjaGFuZ2VzIHRoZXJlIGNhbiBiZSBuZXcgbGluZXMgaWYgZS5nLlxuICAgICAgICAvLyB0aGUgbGluZSB0byB1cGRhdGVkIHdyYXBwZWQgaW4gdGhlIG1lYW50aW1lLlxuICAgICAgICBpZiAodGhpcy5jb25maWcubGFzdFJvdyAhPSBjb25maWcubGFzdFJvdyB8fFxuICAgICAgICAgICAgdGhpcy5jb25maWcuZmlyc3RSb3cgIT0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExpbmVzKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgdmFyIGZpcnN0ID0gTWF0aC5tYXgoZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyk7XG4gICAgICAgIHZhciBsYXN0ID0gTWF0aC5taW4obGFzdFJvdywgY29uZmlnLmxhc3RSb3cpO1xuXG4gICAgICAgIHZhciBsaW5lRWxlbWVudHMgPSB0aGlzLmVsZW1lbnQuY2hpbGROb2RlcztcbiAgICAgICAgdmFyIGxpbmVFbGVtZW50c0lkeCA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgcm93ID0gY29uZmlnLmZpcnN0Um93OyByb3cgPCBmaXJzdDsgcm93KyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmNvbnRhaW5zUm93KGZpcnN0KSkge1xuICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsaW5lRWxlbWVudHNJZHgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdDtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3QpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIHZhciBsaW5lRWxlbWVudDogSFRNTEVsZW1lbnQgPSA8SFRNTEVsZW1lbnQ+bGluZUVsZW1lbnRzW2xpbmVFbGVtZW50c0lkeCsrXTtcbiAgICAgICAgICAgIGlmIChsaW5lRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShcbiAgICAgICAgICAgICAgICAgICAgaHRtbCwgcm93LCAhdGhpcy4kdXNlTGluZUdyb3VwcygpLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKiB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKHJvdykgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbC5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgc2Nyb2xsTGluZXMoY29uZmlnKSB7XG4gICAgICAgIHZhciBvbGRDb25maWcgPSB0aGlzLmNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgaWYgKCFvbGRDb25maWcgfHwgb2xkQ29uZmlnLmxhc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICBpZiAoY29uZmlnLmxhc3RSb3cgPCBvbGRDb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICB2YXIgZWwgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIGlmIChvbGRDb25maWcuZmlyc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShvbGRDb25maWcuZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyAtIDEpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9sZENvbmZpZy5sYXN0Um93ID4gY29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShjb25maWcubGFzdFJvdyArIDEsIG9sZENvbmZpZy5sYXN0Um93KTsgcm93ID4gMDsgcm93LS0pIHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVDaGlsZChlbC5sYXN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy4kcmVuZGVyTGluZXNGcmFnbWVudChjb25maWcsIGNvbmZpZy5maXJzdFJvdywgb2xkQ29uZmlnLmZpcnN0Um93IC0gMSk7XG4gICAgICAgICAgICBpZiAoZWwuZmlyc3RDaGlsZClcbiAgICAgICAgICAgICAgICBlbC5pbnNlcnRCZWZvcmUoZnJhZ21lbnQsIGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA+IG9sZENvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgb2xkQ29uZmlnLmxhc3RSb3cgKyAxLCBjb25maWcubGFzdFJvdyk7XG4gICAgICAgICAgICBlbC5hcHBlbmRDaGlsZChmcmFnbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAvLyBHZXQgdGhlIHRva2VucyBwZXIgbGluZSBhcyB0aGVyZSBtaWdodCBiZSBzb21lIGxpbmVzIGluIGJldHdlZW5cbiAgICAgICAgICAgIC8vIGJlZWluZyBmb2xkZWQuXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKGh0bWwsIHJvdywgZmFsc2UsIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlKTtcblxuICAgICAgICAgICAgLy8gZG9uJ3QgdXNlIHNldElubmVySHRtbCBzaW5jZSB3ZSBhcmUgd29ya2luZyB3aXRoIGFuIGVtcHR5IERJVlxuICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NOYW1lID0gJ2FjZV9saW5lX2dyb3VwJztcbiAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY29udGFpbmVyLmZpcnN0Q2hpbGQpXG4gICAgICAgICAgICAgICAgICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZyYWdtZW50O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGUoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGNvbmZpZy5maXJzdFJvdywgbGFzdFJvdyA9IGNvbmZpZy5sYXN0Um93O1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3RSb3cpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPGRpdiBjbGFzcz0nYWNlX2xpbmVfZ3JvdXAnIHN0eWxlPSdoZWlnaHQ6XCIsIGNvbmZpZy5saW5lSGVpZ2h0ICogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpLCBcInB4Jz5cIilcblxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShodG1sLCByb3csIGZhbHNlLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPC9kaXY+XCIpOyAvLyBlbmQgdGhlIGxpbmUgZ3JvdXBcblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbGVtZW50LmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlcGxhY2VSZWcgPSAvXFx0fCZ8PHwoICspfChbXFx4MDAtXFx4MWZcXHg4MC1cXHhhMFxcdTE2ODBcXHUxODBFXFx1MjAwMC1cXHUyMDBmXFx1MjAyOFxcdTIwMjlcXHUyMDJGXFx1MjA1RlxcdTMwMDBcXHVGRUZGXSl8W1xcdTExMDAtXFx1MTE1RlxcdTExQTMtXFx1MTFBN1xcdTExRkEtXFx1MTFGRlxcdTIzMjktXFx1MjMyQVxcdTJFODAtXFx1MkU5OVxcdTJFOUItXFx1MkVGM1xcdTJGMDAtXFx1MkZENVxcdTJGRjAtXFx1MkZGQlxcdTMwMDAtXFx1MzAzRVxcdTMwNDEtXFx1MzA5NlxcdTMwOTktXFx1MzBGRlxcdTMxMDUtXFx1MzEyRFxcdTMxMzEtXFx1MzE4RVxcdTMxOTAtXFx1MzFCQVxcdTMxQzAtXFx1MzFFM1xcdTMxRjAtXFx1MzIxRVxcdTMyMjAtXFx1MzI0N1xcdTMyNTAtXFx1MzJGRVxcdTMzMDAtXFx1NERCRlxcdTRFMDAtXFx1QTQ4Q1xcdUE0OTAtXFx1QTRDNlxcdUE5NjAtXFx1QTk3Q1xcdUFDMDAtXFx1RDdBM1xcdUQ3QjAtXFx1RDdDNlxcdUQ3Q0ItXFx1RDdGQlxcdUY5MDAtXFx1RkFGRlxcdUZFMTAtXFx1RkUxOVxcdUZFMzAtXFx1RkU1MlxcdUZFNTQtXFx1RkU2NlxcdUZFNjgtXFx1RkU2QlxcdUZGMDEtXFx1RkY2MFxcdUZGRTAtXFx1RkZFNl0vZztcbiAgICAgICAgdmFyIHJlcGxhY2VGdW5jID0gZnVuY3Rpb24oYywgYSwgYiwgdGFiSWR4LCBpZHg0KSB7XG4gICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLnNob3dJbnZpc2libGVzID9cbiAgICAgICAgICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlJz5cIiArIHN0cmluZ1JlcGVhdChzZWxmLlNQQUNFX0NIQVIsIGMubGVuZ3RoKSArIFwiPC9zcGFuPlwiIDpcbiAgICAgICAgICAgICAgICAgICAgc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgYy5sZW5ndGgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiJlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiJiMzODtcIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIjxcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIiYjNjA7XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCJcXHRcIikge1xuICAgICAgICAgICAgICAgIHZhciB0YWJTaXplID0gc2VsZi5zZXNzaW9uLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uICsgdGFiSWR4KTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGFiU2l6ZSAtIDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuJHRhYlN0cmluZ3NbdGFiU2l6ZV07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCJcXHUzMDAwXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBVKzMwMDAgaXMgYm90aCBpbnZpc2libGUgQU5EIGZ1bGwtd2lkdGgsIHNvIG11c3QgYmUgaGFuZGxlZCB1bmlxdWVseVxuICAgICAgICAgICAgICAgIHZhciBjbGFzc1RvVXNlID0gc2VsZi5zaG93SW52aXNpYmxlcyA/IFwiYWNlX2NqayBhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfc3BhY2VcIiA6IFwiYWNlX2Nqa1wiO1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZSA9IHNlbGYuc2hvd0ludmlzaWJsZXMgPyBzZWxmLlNQQUNFX0NIQVIgOiBcIlwiO1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzVG9Vc2UgKyBcIicgc3R5bGU9J3dpZHRoOlwiICtcbiAgICAgICAgICAgICAgICAgICAgKHNlbGYuY29uZmlnLmNoYXJhY3RlcldpZHRoICogMikgK1xuICAgICAgICAgICAgICAgICAgICBcInB4Jz5cIiArIHNwYWNlICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlIGFjZV9pbnZhbGlkJz5cIiArIHNlbGYuU1BBQ0VfQ0hBUiArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nYWNlX2Nqaycgc3R5bGU9J3dpZHRoOlwiICtcbiAgICAgICAgICAgICAgICAgICAgKHNlbGYuY29uZmlnLmNoYXJhY3RlcldpZHRoICogMikgK1xuICAgICAgICAgICAgICAgICAgICBcInB4Jz5cIiArIGMgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvdXRwdXQgPSB2YWx1ZS5yZXBsYWNlKHJlcGxhY2VSZWcsIHJlcGxhY2VGdW5jKTtcblxuICAgICAgICBpZiAoIXRoaXMuJHRleHRUb2tlblt0b2tlbi50eXBlXSkge1xuICAgICAgICAgICAgdmFyIGNsYXNzZXMgPSBcImFjZV9cIiArIHRva2VuLnR5cGUucmVwbGFjZSgvXFwuL2csIFwiIGFjZV9cIik7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHRva2VuLnR5cGUgPT0gXCJmb2xkXCIpXG4gICAgICAgICAgICAgICAgc3R5bGUgPSBcIiBzdHlsZT0nd2lkdGg6XCIgKyAodG9rZW4udmFsdWUubGVuZ3RoICogdGhpcy5jb25maWcuY2hhcmFjdGVyV2lkdGgpICsgXCJweDsnIFwiO1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPHNwYW4gY2xhc3M9J1wiLCBjbGFzc2VzLCBcIidcIiwgc3R5bGUsIFwiPlwiLCBvdXRwdXQsIFwiPC9zcGFuPlwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChvdXRwdXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzY3JlZW5Db2x1bW4gKyB2YWx1ZS5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gRklYTUU7IEhvdyBjYW4gbWF4IGJlIG9wdGlvbmFsIGlmIGl0IGlzIGFsd2F5cyB1c2VkP1xuICAgIHByaXZhdGUgcmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlcjogKG51bWJlciB8IHN0cmluZylbXSwgdmFsdWU6IHN0cmluZywgbWF4PzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGNvbHMgPSB2YWx1ZS5zZWFyY2godGhpcy4kaW5kZW50R3VpZGVSZSk7XG4gICAgICAgIGlmIChjb2xzIDw9IDAgfHwgY29scyA+PSBtYXgpXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIGlmICh2YWx1ZVswXSA9PT0gXCIgXCIpIHtcbiAgICAgICAgICAgIGNvbHMgLT0gY29scyAlIHRoaXMudGFiU2l6ZTtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChzdHJpbmdSZXBlYXQodGhpcy4kdGFiU3RyaW5nc1tcIiBcIl0sIGNvbHMgLyB0aGlzLnRhYlNpemUpKTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5zdWJzdHIoY29scyk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVbMF0gPT0gXCJcXHRcIikge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKHN0cmluZ1JlcGVhdCh0aGlzLiR0YWJTdHJpbmdzW1wiXFx0XCJdLCBjb2xzKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJXcmFwcGVkTGluZShzdHJpbmdCdWlsZGVyOiAobnVtYmVyIHwgc3RyaW5nKVtdLCB0b2tlbnM6IFRva2VuW10sIHNwbGl0czogbnVtYmVyW10sIG9ubHlDb250ZW50cykge1xuICAgICAgICB2YXIgY2hhcnMgPSAwO1xuICAgICAgICB2YXIgc3BsaXQgPSAwO1xuICAgICAgICB2YXIgc3BsaXRDaGFycyA9IHNwbGl0c1swXTtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGkgPT0gMCAmJiB0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgICAgICBjaGFycyA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUsIHNwbGl0Q2hhcnMpO1xuICAgICAgICAgICAgICAgIGlmICghdmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNoYXJzIC09IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoYXJzICsgdmFsdWUubGVuZ3RoIDwgc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChjaGFycyArIHZhbHVlLmxlbmd0aCA+PSBzcGxpdENoYXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4sIHZhbHVlLnN1YnN0cmluZygwLCBzcGxpdENoYXJzIC0gY2hhcnMpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKHNwbGl0Q2hhcnMgLSBjaGFycyk7XG4gICAgICAgICAgICAgICAgICAgIGNoYXJzID0gc3BsaXRDaGFycztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0LCBcInB4Jz5cIlxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Kys7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Q2hhcnMgPSBzcGxpdHNbc3BsaXRdIHx8IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLCB0b2tlbiwgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJTaW1wbGVMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucykge1xuICAgICAgICB2YXIgc2NyZWVuQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIHRva2VuID0gdG9rZW5zWzBdO1xuICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGxheUluZGVudEd1aWRlcylcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5yZW5kZXJJbmRlbnRHdWlkZShzdHJpbmdCdWlsZGVyLCB2YWx1ZSk7XG4gICAgICAgIGlmICh2YWx1ZSlcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHJvdyBpcyBlaXRoZXIgZmlyc3Qgcm93IG9mIGZvbGRsaW5lIG9yIG5vdCBpbiBmb2xkXG4gICAgcHJpdmF0ZSAkcmVuZGVyTGluZShzdHJpbmdCdWlsZGVyOiAobnVtYmVyIHwgc3RyaW5nKVtdLCByb3c6IG51bWJlciwgb25seUNvbnRlbnRzOiBib29sZWFuLCBmb2xkTGluZS8qOiBGb2xkTGluZXxib29sZWFuKi8pIHtcbiAgICAgICAgaWYgKCFmb2xkTGluZSAmJiBmb2xkTGluZSAhPSBmYWxzZSkge1xuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgIHZhciB0b2tlbnM6IFRva2VuW10gPSB0aGlzLiRnZXRGb2xkTGluZVRva2Vucyhyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHRva2VuczogVG9rZW5bXSA9IHRoaXMuc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuXG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXG4gICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0ICogKFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1c2VMaW5lR3JvdXBzKCkgPyAxIDogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpXG4gICAgICAgICAgICAgICAgKSwgXCJweCc+XCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXZSBtYXkgbm90IGdldCB0b2tlbnMgaWYgdGhlcmUgaXMgbm8gbGFuZ3VhZ2UgbW9kZS5cbiAgICAgICAgaWYgKHRva2VucyAmJiB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgc3BsaXRzOiBudW1iZXJbXSA9IHRoaXMuc2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEocm93KTtcbiAgICAgICAgICAgIGlmIChzcGxpdHMgJiYgc3BsaXRzLmxlbmd0aClcbiAgICAgICAgICAgICAgICB0aGlzLiRyZW5kZXJXcmFwcGVkTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMsIHNwbGl0cywgb25seUNvbnRlbnRzKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiRyZW5kZXJTaW1wbGVMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKVxuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3dcblxuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFxuICAgICAgICAgICAgICAgIFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9lb2wnPlwiLFxuICAgICAgICAgICAgICAgIHJvdyA9PSB0aGlzLnNlc3Npb24uZ2V0TGVuZ3RoKCkgLSAxID8gdGhpcy5FT0ZfQ0hBUiA6IHRoaXMuRU9MX0NIQVIsXG4gICAgICAgICAgICAgICAgXCI8L3NwYW4+XCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFvbmx5Q29udGVudHMpXG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXCI8L2Rpdj5cIik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0Rm9sZExpbmVUb2tlbnMocm93OiBudW1iZXIsIGZvbGRMaW5lOiBGb2xkTGluZSk6IFRva2VuW10ge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJlbmRlclRva2VuczogVG9rZW5bXSA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFRva2Vucyh0b2tlbnM6IFRva2VuW10sIGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuICAgICAgICAgICAgdmFyIGlkeCA9IDAsIGNvbCA9IDA7XG4gICAgICAgICAgICB3aGlsZSAoKGNvbCArIHRva2Vuc1tpZHhdLnZhbHVlLmxlbmd0aCkgPCBmcm9tKSB7XG4gICAgICAgICAgICAgICAgY29sICs9IHRva2Vuc1tpZHhdLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZHgrKztcblxuICAgICAgICAgICAgICAgIGlmIChpZHggPT0gdG9rZW5zLmxlbmd0aClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNvbCAhPSBmcm9tKSB7XG4gICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gdG9rZW5zW2lkeF0udmFsdWUuc3Vic3RyaW5nKGZyb20gLSBjb2wpO1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSB0b2tlbiB2YWx1ZSBpcyBsb25nZXIgdGhlbiB0aGUgZnJvbS4uLnRvIHNwYWNpbmcuXG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlLmxlbmd0aCA+ICh0byAtIGZyb20pKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZygwLCB0byAtIGZyb20pO1xuXG4gICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbnNbaWR4XS50eXBlLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWVcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGNvbCA9IGZyb20gKyB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWR4ICs9IDE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdoaWxlIChjb2wgPCB0byAmJiBpZHggPCB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gdG9rZW5zW2lkeF0udmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlLmxlbmd0aCArIGNvbCA+IHRvKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2Vuc1tpZHhdLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUuc3Vic3RyaW5nKDAsIHRvIC0gY29sKVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2godG9rZW5zW2lkeF0pO1xuICAgICAgICAgICAgICAgIGNvbCArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG9rZW5zID0gc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlciwgcm93LCBjb2x1bW4sIGxhc3RDb2x1bW4sIGlzTmV3Um93KSB7XG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJmb2xkXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBwbGFjZWhvbGRlclxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmV3Um93KVxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMgPSBzZXNzaW9uLmdldFRva2Vucyhyb3cpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIGFkZFRva2Vucyh0b2tlbnMsIGxhc3RDb2x1bW4sIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGZvbGRMaW5lLmVuZC5yb3csIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKGZvbGRMaW5lLmVuZC5yb3cpLmxlbmd0aCk7XG5cbiAgICAgICAgcmV0dXJuIHJlbmRlclRva2VucztcbiAgICB9XG5cbiAgICBwcml2YXRlICR1c2VMaW5lR3JvdXBzKCk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBGb3IgdGhlIHVwZGF0ZUxpbmVzIGZ1bmN0aW9uIHRvIHdvcmsgY29ycmVjdGx5LCBpdCdzIGltcG9ydGFudCB0aGF0IHRoZVxuICAgICAgICAvLyBjaGlsZCBub2RlcyBvZiB0aGlzLmVsZW1lbnQgY29ycmVzcG9uZCBvbiBhIDEtdG8tMSBiYXNpcyB0byByb3dzIGluIHRoZVxuICAgICAgICAvLyBkb2N1bWVudCAoYXMgZGlzdGluY3QgZnJvbSBsaW5lcyBvbiB0aGUgc2NyZWVuKS4gRm9yIHNlc3Npb25zIHRoYXQgYXJlXG4gICAgICAgIC8vIHdyYXBwZWQsIHRoaXMgbWVhbnMgd2UgbmVlZCB0byBhZGQgYSBsYXllciB0byB0aGUgbm9kZSBoaWVyYXJjaHkgKHRhZ2dlZFxuICAgICAgICAvLyB3aXRoIHRoZSBjbGFzcyBuYW1lIGFjZV9saW5lX2dyb3VwKS5cbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZGVzdHJveVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIpO1xuICAgICAgICBpZiAodGhpcy4kbWVhc3VyZU5vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuJG1lYXN1cmVOb2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kbWVhc3VyZU5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSB0aGlzLiRtZWFzdXJlTm9kZTtcbiAgICB9XG59XG4iXX0=