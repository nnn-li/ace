import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import { EventEmitterClass } from "../lib/event_emitter";
export default class Text extends EventEmitterClass {
    constructor(parentEl) {
        super();
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
        this.element.className = "ace_layer ace_text-layer";
        parentEl.appendChild(this.element);
        this.$updateEolChar = this.$updateEolChar.bind(this);
        this.EOL_CHAR = this.EOL_CHAR_LF;
    }
    $updateEolChar() {
        var EOL_CHAR = this.session.doc.getNewLineCharacter() == "\n"
            ? this.EOL_CHAR_LF
            : this.EOL_CHAR_CRLF;
        if (this.EOL_CHAR != EOL_CHAR) {
            this.EOL_CHAR = EOL_CHAR;
            return true;
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
        this.$fontMetrics.on("changeCharacterSize", function (e) {
            this._signal("changeCharacterSize", e);
        }.bind(this));
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
        if (value[0] == " ") {
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
        if (!foldLine && foldLine != false)
            foldLine = this.session.getFoldLine(row);
        if (foldLine)
            var tokens = this.$getFoldLineTokens(row, foldLine);
        else
            var tokens = this.session.getTokens(row);
        if (!onlyContents) {
            stringBuilder.push("<div class='ace_line' style='height:", this.config.lineHeight * (this.$useLineGroups() ? 1 : this.session.getRowLength(row)), "px'>");
        }
        if (tokens.length) {
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
        if (this.$measureNode)
            this.$measureNode.parentNode.removeChild(this.$measureNode);
        delete this.$measureNode;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9sYXllci9UZXh0LnRzIl0sIm5hbWVzIjpbIlRleHQiLCJUZXh0LmNvbnN0cnVjdG9yIiwiVGV4dC4kdXBkYXRlRW9sQ2hhciIsIlRleHQuc2V0UGFkZGluZyIsIlRleHQuZ2V0TGluZUhlaWdodCIsIlRleHQuZ2V0Q2hhcmFjdGVyV2lkdGgiLCJUZXh0LiRzZXRGb250TWV0cmljcyIsIlRleHQuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIlRleHQuJHBvbGxTaXplQ2hhbmdlcyIsIlRleHQuc2V0U2Vzc2lvbiIsIlRleHQuc2V0U2hvd0ludmlzaWJsZXMiLCJUZXh0LnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJUZXh0Lm9uQ2hhbmdlVGFiU2l6ZSIsIlRleHQuJGNvbXB1dGVUYWJTdHJpbmciLCJUZXh0LnVwZGF0ZUxpbmVzIiwiVGV4dC5zY3JvbGxMaW5lcyIsIlRleHQuJHJlbmRlckxpbmVzRnJhZ21lbnQiLCJUZXh0LnVwZGF0ZSIsIlRleHQuJHJlbmRlclRva2VuIiwiVGV4dC5yZW5kZXJJbmRlbnRHdWlkZSIsIlRleHQuJHJlbmRlcldyYXBwZWRMaW5lIiwiVGV4dC4kcmVuZGVyU2ltcGxlTGluZSIsIlRleHQuJHJlbmRlckxpbmUiLCJUZXh0LiRnZXRGb2xkTGluZVRva2VucyIsIlRleHQuJGdldEZvbGRMaW5lVG9rZW5zLmFkZFRva2VucyIsIlRleHQuJHVzZUxpbmVHcm91cHMiLCJUZXh0LmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLGFBQWEsRUFBQyxNQUFNLFlBQVk7T0FDakMsRUFBQyxZQUFZLEVBQUMsTUFBTSxhQUFhO09BRWpDLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxzQkFBc0I7QUFHdEQsa0NBQWtDLGlCQUFpQjtJQW9CL0NBLFlBQVlBLFFBQXFCQTtRQUM3QkMsT0FBT0EsQ0FBQ0E7UUFwQkxBLFlBQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFL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QSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxFQUFFQSxHQUFHQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUN6RUEsQ0FBQ0E7Z0JBQ0ZBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNyRkEsV0FBV0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLENBQUNBO1lBQ0RBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU1kLFdBQVdBLENBQUNBLE1BQU1BO1FBQ3JCZSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFFckJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLFNBQVNBLENBQUNBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1lBQ2xEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9CQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFdkNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3hHQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFckNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsRUFBRUEsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3RHQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNqQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsU0FBU0EsQ0FBQ0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7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SUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLE9BQU9BLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO0lBQzdCQSxDQUFDQTtBQUNMMUIsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7Y3JlYXRlRWxlbWVudH0gZnJvbSBcIi4uL2xpYi9kb21cIjtcbmltcG9ydCB7c3RyaW5nUmVwZWF0fSBmcm9tIFwiLi4vbGliL2xhbmdcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCB7RXZlbnRFbWl0dGVyQ2xhc3N9IGZyb20gXCIuLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IEZvbnRNZXRyaWNzIGZyb20gXCIuLi9sYXllci9Gb250TWV0cmljc1wiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUZXh0IGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyBlbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcHJpdmF0ZSAkcGFkZGluZyA9IDA7XG4gICAgcHJpdmF0ZSBFT0ZfQ0hBUiA9IFwiXFx4QjZcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSX0xGID0gXCJcXHhBQ1wiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfQ1JMRiA9IFwiXFx4YTRcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSO1xuICAgIHByaXZhdGUgVEFCX0NIQVIgPSBcIlxcdTIxOTJcIjsgLy9cIlxcdTIxRTVcIjtcbiAgICBwcml2YXRlIFNQQUNFX0NIQVIgPSBcIlxceEI3XCI7XG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IEZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzVGltZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcyA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbiA9IHRydWU7XG4gICAgcHJpdmF0ZSAkdGFiU3RyaW5ncyA9IFtdO1xuICAgIHByaXZhdGUgJHRleHRUb2tlbiA9IHsgXCJ0ZXh0XCI6IHRydWUsIFwicnBhcmVuXCI6IHRydWUsIFwibHBhcmVuXCI6IHRydWUgfTtcbiAgICBwcml2YXRlIHRhYlNpemU7XG4gICAgcHJpdmF0ZSAkaW5kZW50R3VpZGVSZTtcbiAgICBwdWJsaWMgY29uZmlnO1xuICAgIHByaXZhdGUgJG1lYXN1cmVOb2RlO1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudEVsOiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3RleHQtbGF5ZXJcIjtcbiAgICAgICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICAgICAgdGhpcy4kdXBkYXRlRW9sQ2hhciA9IHRoaXMuJHVwZGF0ZUVvbENoYXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5FT0xfQ0hBUiA9IHRoaXMuRU9MX0NIQVJfTEY7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUVvbENoYXIoKSB7XG4gICAgICAgIHZhciBFT0xfQ0hBUiA9IHRoaXMuc2Vzc2lvbi5kb2MuZ2V0TmV3TGluZUNoYXJhY3RlcigpID09IFwiXFxuXCJcbiAgICAgICAgICAgID8gdGhpcy5FT0xfQ0hBUl9MRlxuICAgICAgICAgICAgOiB0aGlzLkVPTF9DSEFSX0NSTEY7XG4gICAgICAgIGlmICh0aGlzLkVPTF9DSEFSICE9IEVPTF9DSEFSKSB7XG4gICAgICAgICAgICB0aGlzLkVPTF9DSEFSID0gRU9MX0NIQVI7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSBcIjAgXCIgKyBwYWRkaW5nICsgXCJweFwiO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRMaW5lSGVpZ2h0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kZm9udE1ldHJpY3MuJGNoYXJhY3RlclNpemUuaGVpZ2h0IHx8IDA7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENoYXJhY3RlcldpZHRoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kZm9udE1ldHJpY3MuJGNoYXJhY3RlclNpemUud2lkdGggfHwgMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHNldEZvbnRNZXRyaWNzKG1lYXN1cmU6IEZvbnRNZXRyaWNzKSB7XG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbWVhc3VyZTtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3Mub24oXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuJHBvbGxTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjaGVja0ZvclNpemVDaGFuZ2VzKCkge1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIgPSB0aGlzLiRmb250TWV0cmljcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgPT09IHNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNob3dJbnZpc2libGVzID0gc2hvd0ludmlzaWJsZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMgPT09IGRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheUluZGVudEd1aWRlcyA9IGRpc3BsYXlJbmRlbnRHdWlkZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZJWE1FOiBER0ggQ2hlY2sgdGhhdCB0aGlzIGlzIGNvbnNpc3RlbnQgd2l0aCBBQ0VcbiAgICBwdWJsaWMgb25DaGFuZ2VUYWJTaXplKCkge1xuICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKClcbiAgICB9XG5cbiAgICAvLyAgICB0aGlzLm9uQ2hhbmdlVGFiU2l6ZSA9XG4gICAgcHJpdmF0ZSAkY29tcHV0ZVRhYlN0cmluZygpIHtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB0aGlzLnRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICB2YXIgdGFiU3RyID0gdGhpcy4kdGFiU3RyaW5ncyA9IFtcIjBcIl07XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdGFiU2l6ZSArIDE7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgICAgICB0YWJTdHIucHVzaChcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfdGFiJz5cIlxuICAgICAgICAgICAgICAgICAgICArIHRoaXMuVEFCX0NIQVJcbiAgICAgICAgICAgICAgICAgICAgKyBzdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCBpIC0gMSlcbiAgICAgICAgICAgICAgICAgICAgKyBcIjwvc3Bhbj5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICB0aGlzLiRpbmRlbnRHdWlkZVJlID0gL1xcc1xcU3wgXFx0fFxcdCB8XFxzJC87XG4gICAgICAgICAgICB2YXIgY2xhc3NOYW1lID0gXCJhY2VfaW5kZW50LWd1aWRlXCI7XG4gICAgICAgICAgICB2YXIgc3BhY2VDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICB2YXIgdGFiQ2xhc3MgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgKz0gXCIgYWNlX2ludmlzaWJsZVwiO1xuICAgICAgICAgICAgICAgIHNwYWNlQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3NwYWNlXCI7XG4gICAgICAgICAgICAgICAgdGFiQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3RhYlwiO1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZUNvbnRlbnQgPSBzdHJpbmdSZXBlYXQodGhpcy5TUEFDRV9DSEFSLCB0aGlzLnRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50ID0gdGhpcy5UQUJfQ0hBUiArIHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIHRoaXMudGFiU2l6ZSAtIDEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2VDb250ZW50ID0gc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgdGhpcy50YWJTaXplKTtcbiAgICAgICAgICAgICAgICB2YXIgdGFiQ29udGVudCA9IHNwYWNlQ29udGVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIiBcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHNwYWNlQ2xhc3MgKyBcIic+XCIgKyBzcGFjZUNvbnRlbnQgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIHRoaXMuJHRhYlN0cmluZ3NbXCJcXHRcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHRhYkNsYXNzICsgXCInPlwiICsgdGFiQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUxpbmVzKGNvbmZpZzogeyBmaXJzdFJvdzogbnVtYmVyOyBsYXN0Um93OiBudW1iZXI7IGxpbmVIZWlnaHQ6IG51bWJlciB9LCBmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gRHVlIHRvIHdyYXAgbGluZSBjaGFuZ2VzIHRoZXJlIGNhbiBiZSBuZXcgbGluZXMgaWYgZS5nLlxuICAgICAgICAvLyB0aGUgbGluZSB0byB1cGRhdGVkIHdyYXBwZWQgaW4gdGhlIG1lYW50aW1lLlxuICAgICAgICBpZiAodGhpcy5jb25maWcubGFzdFJvdyAhPSBjb25maWcubGFzdFJvdyB8fFxuICAgICAgICAgICAgdGhpcy5jb25maWcuZmlyc3RSb3cgIT0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExpbmVzKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgdmFyIGZpcnN0ID0gTWF0aC5tYXgoZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyk7XG4gICAgICAgIHZhciBsYXN0ID0gTWF0aC5taW4obGFzdFJvdywgY29uZmlnLmxhc3RSb3cpO1xuXG4gICAgICAgIHZhciBsaW5lRWxlbWVudHMgPSB0aGlzLmVsZW1lbnQuY2hpbGROb2RlcztcbiAgICAgICAgdmFyIGxpbmVFbGVtZW50c0lkeCA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgcm93ID0gY29uZmlnLmZpcnN0Um93OyByb3cgPCBmaXJzdDsgcm93KyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmNvbnRhaW5zUm93KGZpcnN0KSkge1xuICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsaW5lRWxlbWVudHNJZHgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdDtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3QpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIHZhciBsaW5lRWxlbWVudDogSFRNTEVsZW1lbnQgPSA8SFRNTEVsZW1lbnQ+bGluZUVsZW1lbnRzW2xpbmVFbGVtZW50c0lkeCsrXTtcbiAgICAgICAgICAgIGlmIChsaW5lRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShcbiAgICAgICAgICAgICAgICAgICAgaHRtbCwgcm93LCAhdGhpcy4kdXNlTGluZUdyb3VwcygpLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKiB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKHJvdykgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbC5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgc2Nyb2xsTGluZXMoY29uZmlnKSB7XG4gICAgICAgIHZhciBvbGRDb25maWcgPSB0aGlzLmNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgaWYgKCFvbGRDb25maWcgfHwgb2xkQ29uZmlnLmxhc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICBpZiAoY29uZmlnLmxhc3RSb3cgPCBvbGRDb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICB2YXIgZWwgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIGlmIChvbGRDb25maWcuZmlyc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShvbGRDb25maWcuZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyAtIDEpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9sZENvbmZpZy5sYXN0Um93ID4gY29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShjb25maWcubGFzdFJvdyArIDEsIG9sZENvbmZpZy5sYXN0Um93KTsgcm93ID4gMDsgcm93LS0pIHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVDaGlsZChlbC5sYXN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy4kcmVuZGVyTGluZXNGcmFnbWVudChjb25maWcsIGNvbmZpZy5maXJzdFJvdywgb2xkQ29uZmlnLmZpcnN0Um93IC0gMSk7XG4gICAgICAgICAgICBpZiAoZWwuZmlyc3RDaGlsZClcbiAgICAgICAgICAgICAgICBlbC5pbnNlcnRCZWZvcmUoZnJhZ21lbnQsIGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA+IG9sZENvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgb2xkQ29uZmlnLmxhc3RSb3cgKyAxLCBjb25maWcubGFzdFJvdyk7XG4gICAgICAgICAgICBlbC5hcHBlbmRDaGlsZChmcmFnbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAvLyBHZXQgdGhlIHRva2VucyBwZXIgbGluZSBhcyB0aGVyZSBtaWdodCBiZSBzb21lIGxpbmVzIGluIGJldHdlZW5cbiAgICAgICAgICAgIC8vIGJlZWluZyBmb2xkZWQuXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKGh0bWwsIHJvdywgZmFsc2UsIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlKTtcblxuICAgICAgICAgICAgLy8gZG9uJ3QgdXNlIHNldElubmVySHRtbCBzaW5jZSB3ZSBhcmUgd29ya2luZyB3aXRoIGFuIGVtcHR5IERJVlxuICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NOYW1lID0gJ2FjZV9saW5lX2dyb3VwJztcbiAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY29udGFpbmVyLmZpcnN0Q2hpbGQpXG4gICAgICAgICAgICAgICAgICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZyYWdtZW50O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGUoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGNvbmZpZy5maXJzdFJvdywgbGFzdFJvdyA9IGNvbmZpZy5sYXN0Um93O1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3RSb3cpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPGRpdiBjbGFzcz0nYWNlX2xpbmVfZ3JvdXAnIHN0eWxlPSdoZWlnaHQ6XCIsIGNvbmZpZy5saW5lSGVpZ2h0ICogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpLCBcInB4Jz5cIilcblxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShodG1sLCByb3csIGZhbHNlLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPC9kaXY+XCIpOyAvLyBlbmQgdGhlIGxpbmUgZ3JvdXBcblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbGVtZW50LmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlcGxhY2VSZWcgPSAvXFx0fCZ8PHwoICspfChbXFx4MDAtXFx4MWZcXHg4MC1cXHhhMFxcdTE2ODBcXHUxODBFXFx1MjAwMC1cXHUyMDBmXFx1MjAyOFxcdTIwMjlcXHUyMDJGXFx1MjA1RlxcdTMwMDBcXHVGRUZGXSl8W1xcdTExMDAtXFx1MTE1RlxcdTExQTMtXFx1MTFBN1xcdTExRkEtXFx1MTFGRlxcdTIzMjktXFx1MjMyQVxcdTJFODAtXFx1MkU5OVxcdTJFOUItXFx1MkVGM1xcdTJGMDAtXFx1MkZENVxcdTJGRjAtXFx1MkZGQlxcdTMwMDAtXFx1MzAzRVxcdTMwNDEtXFx1MzA5NlxcdTMwOTktXFx1MzBGRlxcdTMxMDUtXFx1MzEyRFxcdTMxMzEtXFx1MzE4RVxcdTMxOTAtXFx1MzFCQVxcdTMxQzAtXFx1MzFFM1xcdTMxRjAtXFx1MzIxRVxcdTMyMjAtXFx1MzI0N1xcdTMyNTAtXFx1MzJGRVxcdTMzMDAtXFx1NERCRlxcdTRFMDAtXFx1QTQ4Q1xcdUE0OTAtXFx1QTRDNlxcdUE5NjAtXFx1QTk3Q1xcdUFDMDAtXFx1RDdBM1xcdUQ3QjAtXFx1RDdDNlxcdUQ3Q0ItXFx1RDdGQlxcdUY5MDAtXFx1RkFGRlxcdUZFMTAtXFx1RkUxOVxcdUZFMzAtXFx1RkU1MlxcdUZFNTQtXFx1RkU2NlxcdUZFNjgtXFx1RkU2QlxcdUZGMDEtXFx1RkY2MFxcdUZGRTAtXFx1RkZFNl0vZztcbiAgICAgICAgdmFyIHJlcGxhY2VGdW5jID0gZnVuY3Rpb24oYywgYSwgYiwgdGFiSWR4LCBpZHg0KSB7XG4gICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLnNob3dJbnZpc2libGVzID9cbiAgICAgICAgICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlJz5cIiArIHN0cmluZ1JlcGVhdChzZWxmLlNQQUNFX0NIQVIsIGMubGVuZ3RoKSArIFwiPC9zcGFuPlwiIDpcbiAgICAgICAgICAgICAgICAgICAgc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgYy5sZW5ndGgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiJlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiJiMzODtcIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIjxcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIiYjNjA7XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCJcXHRcIikge1xuICAgICAgICAgICAgICAgIHZhciB0YWJTaXplID0gc2VsZi5zZXNzaW9uLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uICsgdGFiSWR4KTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGFiU2l6ZSAtIDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuJHRhYlN0cmluZ3NbdGFiU2l6ZV07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCJcXHUzMDAwXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBVKzMwMDAgaXMgYm90aCBpbnZpc2libGUgQU5EIGZ1bGwtd2lkdGgsIHNvIG11c3QgYmUgaGFuZGxlZCB1bmlxdWVseVxuICAgICAgICAgICAgICAgIHZhciBjbGFzc1RvVXNlID0gc2VsZi5zaG93SW52aXNpYmxlcyA/IFwiYWNlX2NqayBhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfc3BhY2VcIiA6IFwiYWNlX2Nqa1wiO1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZSA9IHNlbGYuc2hvd0ludmlzaWJsZXMgPyBzZWxmLlNQQUNFX0NIQVIgOiBcIlwiO1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzVG9Vc2UgKyBcIicgc3R5bGU9J3dpZHRoOlwiICtcbiAgICAgICAgICAgICAgICAgICAgKHNlbGYuY29uZmlnLmNoYXJhY3RlcldpZHRoICogMikgK1xuICAgICAgICAgICAgICAgICAgICBcInB4Jz5cIiArIHNwYWNlICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlIGFjZV9pbnZhbGlkJz5cIiArIHNlbGYuU1BBQ0VfQ0hBUiArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nYWNlX2Nqaycgc3R5bGU9J3dpZHRoOlwiICtcbiAgICAgICAgICAgICAgICAgICAgKHNlbGYuY29uZmlnLmNoYXJhY3RlcldpZHRoICogMikgK1xuICAgICAgICAgICAgICAgICAgICBcInB4Jz5cIiArIGMgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvdXRwdXQgPSB2YWx1ZS5yZXBsYWNlKHJlcGxhY2VSZWcsIHJlcGxhY2VGdW5jKTtcblxuICAgICAgICBpZiAoIXRoaXMuJHRleHRUb2tlblt0b2tlbi50eXBlXSkge1xuICAgICAgICAgICAgdmFyIGNsYXNzZXMgPSBcImFjZV9cIiArIHRva2VuLnR5cGUucmVwbGFjZSgvXFwuL2csIFwiIGFjZV9cIik7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHRva2VuLnR5cGUgPT0gXCJmb2xkXCIpXG4gICAgICAgICAgICAgICAgc3R5bGUgPSBcIiBzdHlsZT0nd2lkdGg6XCIgKyAodG9rZW4udmFsdWUubGVuZ3RoICogdGhpcy5jb25maWcuY2hhcmFjdGVyV2lkdGgpICsgXCJweDsnIFwiO1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPHNwYW4gY2xhc3M9J1wiLCBjbGFzc2VzLCBcIidcIiwgc3R5bGUsIFwiPlwiLCBvdXRwdXQsIFwiPC9zcGFuPlwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChvdXRwdXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzY3JlZW5Db2x1bW4gKyB2YWx1ZS5sZW5ndGg7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW5kZXJJbmRlbnRHdWlkZShzdHJpbmdCdWlsZGVyLCB2YWx1ZSwgbWF4Pykge1xuICAgICAgICB2YXIgY29scyA9IHZhbHVlLnNlYXJjaCh0aGlzLiRpbmRlbnRHdWlkZVJlKTtcbiAgICAgICAgaWYgKGNvbHMgPD0gMCB8fCBjb2xzID49IG1heClcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgaWYgKHZhbHVlWzBdID09IFwiIFwiKSB7XG4gICAgICAgICAgICBjb2xzIC09IGNvbHMgJSB0aGlzLnRhYlNpemU7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goc3RyaW5nUmVwZWF0KHRoaXMuJHRhYlN0cmluZ3NbXCIgXCJdLCBjb2xzIC8gdGhpcy50YWJTaXplKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlWzBdID09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChzdHJpbmdSZXBlYXQodGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSwgY29scykpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnN1YnN0cihjb2xzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdLCBzcGxpdHM6IG51bWJlcltdLCBvbmx5Q29udGVudHMpIHtcbiAgICAgICAgdmFyIGNoYXJzID0gMDtcbiAgICAgICAgdmFyIHNwbGl0ID0gMDtcbiAgICAgICAgdmFyIHNwbGl0Q2hhcnMgPSBzcGxpdHNbMF07XG4gICAgICAgIHZhciBzY3JlZW5Db2x1bW4gPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIGlmIChpID09IDAgJiYgdGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICAgICAgY2hhcnMgPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXIsIHZhbHVlLCBzcGxpdENoYXJzKTtcbiAgICAgICAgICAgICAgICBpZiAoIXZhbHVlKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjaGFycyAtPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjaGFycyArIHZhbHVlLmxlbmd0aCA8IHNwbGl0Q2hhcnMpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY2hhcnMgKyB2YWx1ZS5sZW5ndGggPj0gc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuLCB2YWx1ZS5zdWJzdHJpbmcoMCwgc3BsaXRDaGFycyAtIGNoYXJzKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZyhzcGxpdENoYXJzIC0gY2hhcnMpO1xuICAgICAgICAgICAgICAgICAgICBjaGFycyA9IHNwbGl0Q2hhcnM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvbmx5Q29udGVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjwvZGl2PlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCwgXCJweCc+XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzcGxpdCsrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgICAgICBzcGxpdENoYXJzID0gc3BsaXRzW3NwbGl0XSB8fCBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpIHtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1swXTtcbiAgICAgICAgdmFyIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpXG4gICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUpO1xuICAgICAgICBpZiAodmFsdWUpXG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyByb3cgaXMgZWl0aGVyIGZpcnN0IHJvdyBvZiBmb2xkbGluZSBvciBub3QgaW4gZm9sZFxuICAgIHByaXZhdGUgJHJlbmRlckxpbmUoc3RyaW5nQnVpbGRlciwgcm93OiBudW1iZXIsIG9ubHlDb250ZW50cywgZm9sZExpbmUpIHtcbiAgICAgICAgaWYgKCFmb2xkTGluZSAmJiBmb2xkTGluZSAhPSBmYWxzZSlcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lKVxuICAgICAgICAgICAgdmFyIHRva2VuczogYW55W10gPSB0aGlzLiRnZXRGb2xkTGluZVRva2Vucyhyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHRva2VuczogYW55W10gPSB0aGlzLnNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG5cblxuICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFxuICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCAqIChcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXNlTGluZUdyb3VwcygpID8gMSA6IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KVxuICAgICAgICAgICAgICAgICksIFwicHgnPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gdGhpcy5zZXNzaW9uLmdldFJvd1NwbGl0RGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKHNwbGl0cyAmJiBzcGxpdHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRoaXMuJHJlbmRlcldyYXBwZWRMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucywgc3BsaXRzLCBvbmx5Q29udGVudHMpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHJlbmRlclNpbXBsZUxpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvd1xuXG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXG4gICAgICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX2VvbCc+XCIsXG4gICAgICAgICAgICAgICAgcm93ID09IHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEgPyB0aGlzLkVPRl9DSEFSIDogdGhpcy5FT0xfQ0hBUixcbiAgICAgICAgICAgICAgICBcIjwvc3Bhbj5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9ubHlDb250ZW50cylcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjwvZGl2PlwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRGb2xkTGluZVRva2Vucyhyb3c6IG51bWJlciwgZm9sZExpbmUpOiB7fVtdIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByZW5kZXJUb2tlbnM6IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFRva2Vucyh0b2tlbnM6IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKSB7XG4gICAgICAgICAgICB2YXIgaWR4ID0gMCwgY29sID0gMDtcbiAgICAgICAgICAgIHdoaWxlICgoY29sICsgdG9rZW5zW2lkeF0udmFsdWUubGVuZ3RoKSA8IGZyb20pIHtcbiAgICAgICAgICAgICAgICBjb2wgKz0gdG9rZW5zW2lkeF0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlkeCA9PSB0b2tlbnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29sICE9IGZyb20pIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnNbaWR4XS52YWx1ZS5zdWJzdHJpbmcoZnJvbSAtIGNvbCk7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIHRva2VuIHZhbHVlIGlzIGxvbmdlciB0aGVuIHRoZSBmcm9tLi4udG8gc3BhY2luZy5cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoID4gKHRvIC0gZnJvbSkpXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIHRvIC0gZnJvbSk7XG5cbiAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2Vuc1tpZHhdLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgY29sID0gZnJvbSArIHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZHggKz0gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUgKGNvbCA8IHRvICYmIGlkeCA8IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnNbaWR4XS52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoICsgY29sID4gdG8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW5zW2lkeF0udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZS5zdWJzdHJpbmcoMCwgdG8gLSBjb2wpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh0b2tlbnNbaWR4XSk7XG4gICAgICAgICAgICAgICAgY29sICs9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZHggKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbnMgPSBzZXNzaW9uLmdldFRva2Vucyhyb3cpO1xuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbiwgaXNOZXdSb3cpIHtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImZvbGRcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOZXdSb3cpXG4gICAgICAgICAgICAgICAgICAgIHRva2VucyA9IHNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLmxlbmd0aClcbiAgICAgICAgICAgICAgICAgICAgYWRkVG9rZW5zKHRva2VucywgbGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZm9sZExpbmUuZW5kLnJvdywgdGhpcy5zZXNzaW9uLmdldExpbmUoZm9sZExpbmUuZW5kLnJvdykubGVuZ3RoKTtcblxuICAgICAgICByZXR1cm4gcmVuZGVyVG9rZW5zO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVzZUxpbmVHcm91cHMoKSB7XG4gICAgICAgIC8vIEZvciB0aGUgdXBkYXRlTGluZXMgZnVuY3Rpb24gdG8gd29yayBjb3JyZWN0bHksIGl0J3MgaW1wb3J0YW50IHRoYXQgdGhlXG4gICAgICAgIC8vIGNoaWxkIG5vZGVzIG9mIHRoaXMuZWxlbWVudCBjb3JyZXNwb25kIG9uIGEgMS10by0xIGJhc2lzIHRvIHJvd3MgaW4gdGhlXG4gICAgICAgIC8vIGRvY3VtZW50IChhcyBkaXN0aW5jdCBmcm9tIGxpbmVzIG9uIHRoZSBzY3JlZW4pLiBGb3Igc2Vzc2lvbnMgdGhhdCBhcmVcbiAgICAgICAgLy8gd3JhcHBlZCwgdGhpcyBtZWFucyB3ZSBuZWVkIHRvIGFkZCBhIGxheWVyIHRvIHRoZSBub2RlIGhpZXJhcmNoeSAodGFnZ2VkXG4gICAgICAgIC8vIHdpdGggdGhlIGNsYXNzIG5hbWUgYWNlX2xpbmVfZ3JvdXApLlxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIpO1xuICAgICAgICBpZiAodGhpcy4kbWVhc3VyZU5vZGUpXG4gICAgICAgICAgICB0aGlzLiRtZWFzdXJlTm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuJG1lYXN1cmVOb2RlKTtcbiAgICAgICAgZGVsZXRlIHRoaXMuJG1lYXN1cmVOb2RlO1xuICAgIH1cbn1cbiJdfQ==