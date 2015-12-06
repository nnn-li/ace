import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import { EventEmitterClass } from "../lib/event_emitter";
export class Text extends EventEmitterClass {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9sYXllci90ZXh0LnRzIl0sIm5hbWVzIjpbIlRleHQiLCJUZXh0LmNvbnN0cnVjdG9yIiwiVGV4dC4kdXBkYXRlRW9sQ2hhciIsIlRleHQuc2V0UGFkZGluZyIsIlRleHQuZ2V0TGluZUhlaWdodCIsIlRleHQuZ2V0Q2hhcmFjdGVyV2lkdGgiLCJUZXh0LiRzZXRGb250TWV0cmljcyIsIlRleHQuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIlRleHQuJHBvbGxTaXplQ2hhbmdlcyIsIlRleHQuc2V0U2Vzc2lvbiIsIlRleHQuc2V0U2hvd0ludmlzaWJsZXMiLCJUZXh0LnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJUZXh0Lm9uQ2hhbmdlVGFiU2l6ZSIsIlRleHQuJGNvbXB1dGVUYWJTdHJpbmciLCJUZXh0LnVwZGF0ZUxpbmVzIiwiVGV4dC5zY3JvbGxMaW5lcyIsIlRleHQuJHJlbmRlckxpbmVzRnJhZ21lbnQiLCJUZXh0LnVwZGF0ZSIsIlRleHQuJHJlbmRlclRva2VuIiwiVGV4dC5yZW5kZXJJbmRlbnRHdWlkZSIsIlRleHQuJHJlbmRlcldyYXBwZWRMaW5lIiwiVGV4dC4kcmVuZGVyU2ltcGxlTGluZSIsIlRleHQuJHJlbmRlckxpbmUiLCJUZXh0LiRnZXRGb2xkTGluZVRva2VucyIsIlRleHQuJGdldEZvbGRMaW5lVG9rZW5zLmFkZFRva2VucyIsIlRleHQuJHVzZUxpbmVHcm91cHMiLCJUZXh0LmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLGFBQWEsRUFBQyxNQUFNLFlBQVk7T0FDakMsRUFBQyxZQUFZLEVBQUMsTUFBTSxhQUFhO09BRWpDLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxzQkFBc0I7QUFHdEQsMEJBQTBCLGlCQUFpQjtJQW9CdkNBLFlBQVlBLFFBQXFCQTtRQUM3QkMsT0FBT0EsQ0FBQ0E7UUFwQkxBLFlBQU9BLEdBQW1CQSxhQUFhQSxDQUFDQSxLQUFL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QSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxJQUFJQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXJCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBO1FBQzNDQSxJQUFJQSxlQUFlQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUV4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0EsR0FBR0EsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDakRBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzdDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtvQkFDM0JBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pB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QSxDQUFDQSxDQUFDQTtZQUV2Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDeEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ2pDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ2RBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQTtnQkFDQUEsRUFBRUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3hGQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT2Ysb0JBQW9CQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxFQUFFQSxPQUFPQTtRQUNsRGdCLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLHNCQUFzQkEsRUFBRUEsQ0FBQ0E7UUFDbkVBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBQ25CQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqREEsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekRBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBO1lBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDdkRBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQTtnQkFDZEEsS0FBS0EsQ0FBQ0E7WUFFVkEsSUFBSUEsU0FBU0EsR0FBbUJBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXJEQSxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUdkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxLQUFLQSxFQUFFQSxHQUFHQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUd4RUEsU0FBU0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4QkEsU0FBU0EsQ0FBQ0EsU0FBU0EsR0FBR0EsZ0JBQWdCQSxDQUFDQTtnQkFDdkNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUNoQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FB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QUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUNoRUEsT0FBT0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDN0JBLENBQUNBO0FBQ0wxQixDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHtjcmVhdGVFbGVtZW50fSBmcm9tIFwiLi4vbGliL2RvbVwiO1xuaW1wb3J0IHtzdHJpbmdSZXBlYXR9IGZyb20gXCIuLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtFZGl0U2Vzc2lvbn0gZnJvbSBcIi4uL2VkaXRfc2Vzc2lvblwiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4uL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQge0ZvbnRNZXRyaWNzfSBmcm9tIFwiLi4vbGF5ZXIvZm9udF9tZXRyaWNzXCI7XG5cbmV4cG9ydCBjbGFzcyBUZXh0IGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyBlbGVtZW50ID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcHJpdmF0ZSAkcGFkZGluZyA9IDA7XG4gICAgcHJpdmF0ZSBFT0ZfQ0hBUiA9IFwiXFx4QjZcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSX0xGID0gXCJcXHhBQ1wiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfQ1JMRiA9IFwiXFx4YTRcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSO1xuICAgIHByaXZhdGUgVEFCX0NIQVIgPSBcIlxcdTIxOTJcIjsgLy9cIlxcdTIxRTVcIjtcbiAgICBwcml2YXRlIFNQQUNFX0NIQVIgPSBcIlxceEI3XCI7XG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IEZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzVGltZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcyA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbiA9IHRydWU7XG4gICAgcHJpdmF0ZSAkdGFiU3RyaW5ncyA9IFtdO1xuICAgIHByaXZhdGUgJHRleHRUb2tlbiA9IHsgXCJ0ZXh0XCI6IHRydWUsIFwicnBhcmVuXCI6IHRydWUsIFwibHBhcmVuXCI6IHRydWUgfTtcbiAgICBwcml2YXRlIHRhYlNpemU7XG4gICAgcHJpdmF0ZSAkaW5kZW50R3VpZGVSZTtcbiAgICBwdWJsaWMgY29uZmlnO1xuICAgIHByaXZhdGUgJG1lYXN1cmVOb2RlO1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudEVsOiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLmVsZW1lbnQuY2xhc3NOYW1lID0gXCJhY2VfbGF5ZXIgYWNlX3RleHQtbGF5ZXJcIjtcbiAgICAgICAgcGFyZW50RWwuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcbiAgICAgICAgdGhpcy4kdXBkYXRlRW9sQ2hhciA9IHRoaXMuJHVwZGF0ZUVvbENoYXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5FT0xfQ0hBUiA9IHRoaXMuRU9MX0NIQVJfTEY7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUVvbENoYXIoKSB7XG4gICAgICAgIHZhciBFT0xfQ0hBUiA9IHRoaXMuc2Vzc2lvbi5kb2MuZ2V0TmV3TGluZUNoYXJhY3RlcigpID09IFwiXFxuXCJcbiAgICAgICAgICAgID8gdGhpcy5FT0xfQ0hBUl9MRlxuICAgICAgICAgICAgOiB0aGlzLkVPTF9DSEFSX0NSTEY7XG4gICAgICAgIGlmICh0aGlzLkVPTF9DSEFSICE9IEVPTF9DSEFSKSB7XG4gICAgICAgICAgICB0aGlzLkVPTF9DSEFSID0gRU9MX0NIQVI7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzZXRQYWRkaW5nKHBhZGRpbmc6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRwYWRkaW5nID0gcGFkZGluZztcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSBcIjAgXCIgKyBwYWRkaW5nICsgXCJweFwiO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRMaW5lSGVpZ2h0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kZm9udE1ldHJpY3MuJGNoYXJhY3RlclNpemUuaGVpZ2h0IHx8IDA7XG4gICAgfVxuXG4gICAgcHVibGljIGdldENoYXJhY3RlcldpZHRoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kZm9udE1ldHJpY3MuJGNoYXJhY3RlclNpemUud2lkdGggfHwgMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHNldEZvbnRNZXRyaWNzKG1lYXN1cmUpIHtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBtZWFzdXJlO1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5vbihcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBlKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGNoZWNrRm9yU2l6ZUNoYW5nZXMoKSB7XG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzLmNoZWNrRm9yU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRwb2xsU2l6ZUNoYW5nZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRwb2xsU2l6ZUNoYW5nZXNUaW1lciA9IHRoaXMuJGZvbnRNZXRyaWNzLiRwb2xsU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlczogYm9vbGVhbikge1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyA9PT0gc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2hvd0ludmlzaWJsZXMgPSBzaG93SW52aXNpYmxlcztcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGxheUluZGVudEd1aWRlcyA9PT0gZGlzcGxheUluZGVudEd1aWRlcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzID0gZGlzcGxheUluZGVudEd1aWRlcztcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRklYTUU6IERHSCBDaGVjayB0aGF0IHRoaXMgaXMgY29uc2lzdGVudCB3aXRoIEFDRVxuICAgIHB1YmxpYyBvbkNoYW5nZVRhYlNpemUoKSB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKVxuICAgIH1cblxuICAgIC8vICAgIHRoaXMub25DaGFuZ2VUYWJTaXplID1cbiAgICBwcml2YXRlICRjb21wdXRlVGFiU3RyaW5nKCkge1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHRoaXMudGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICAgIHZhciB0YWJTdHIgPSB0aGlzLiR0YWJTdHJpbmdzID0gW1wiMFwiXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0YWJTaXplICsgMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV90YWInPlwiXG4gICAgICAgICAgICAgICAgICAgICsgdGhpcy5UQUJfQ0hBUlxuICAgICAgICAgICAgICAgICAgICArIHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGkgLSAxKVxuICAgICAgICAgICAgICAgICAgICArIFwiPC9zcGFuPlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGFiU3RyLnB1c2goc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGluZGVudEd1aWRlUmUgPSAvXFxzXFxTfCBcXHR8XFx0IHxcXHMkLztcbiAgICAgICAgICAgIHZhciBjbGFzc05hbWUgPSBcImFjZV9pbmRlbnQtZ3VpZGVcIjtcbiAgICAgICAgICAgIHZhciBzcGFjZUNsYXNzID0gXCJcIjtcbiAgICAgICAgICAgIHZhciB0YWJDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSArPSBcIiBhY2VfaW52aXNpYmxlXCI7XG4gICAgICAgICAgICAgICAgc3BhY2VDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfc3BhY2VcIjtcbiAgICAgICAgICAgICAgICB0YWJDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfdGFiXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlQ29udGVudCA9IHN0cmluZ1JlcGVhdCh0aGlzLlNQQUNFX0NIQVIsIHRoaXMudGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHRhYkNvbnRlbnQgPSB0aGlzLlRBQl9DSEFSICsgc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgdGhpcy50YWJTaXplIC0gMSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZUNvbnRlbnQgPSBzdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCB0aGlzLnRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50ID0gc3BhY2VDb250ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiR0YWJTdHJpbmdzW1wiIFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgc3BhY2VDbGFzcyArIFwiJz5cIiArIHNwYWNlQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgdGFiQ2xhc3MgKyBcIic+XCIgKyB0YWJDb250ZW50ICsgXCI8L3NwYW4+XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlTGluZXMoY29uZmlnOiB7IGZpcnN0Um93OiBudW1iZXI7IGxhc3RSb3c6IG51bWJlcjsgbGluZUhlaWdodDogbnVtYmVyIH0sIGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBEdWUgdG8gd3JhcCBsaW5lIGNoYW5nZXMgdGhlcmUgY2FuIGJlIG5ldyBsaW5lcyBpZiBlLmcuXG4gICAgICAgIC8vIHRoZSBsaW5lIHRvIHVwZGF0ZWQgd3JhcHBlZCBpbiB0aGUgbWVhbnRpbWUuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5sYXN0Um93ICE9IGNvbmZpZy5sYXN0Um93IHx8XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5maXJzdFJvdyAhPSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGluZXMoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICB2YXIgZmlyc3QgPSBNYXRoLm1heChmaXJzdFJvdywgY29uZmlnLmZpcnN0Um93KTtcbiAgICAgICAgdmFyIGxhc3QgPSBNYXRoLm1pbihsYXN0Um93LCBjb25maWcubGFzdFJvdyk7XG5cbiAgICAgICAgdmFyIGxpbmVFbGVtZW50cyA9IHRoaXMuZWxlbWVudC5jaGlsZE5vZGVzO1xuICAgICAgICB2YXIgbGluZUVsZW1lbnRzSWR4ID0gMDtcblxuICAgICAgICBmb3IgKHZhciByb3cgPSBjb25maWcuZmlyc3RSb3c7IHJvdyA8IGZpcnN0OyByb3crKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuY29udGFpbnNSb3coZmlyc3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxpbmVFbGVtZW50c0lkeCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0O1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93ID4gbGFzdClcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgdmFyIGxpbmVFbGVtZW50OiBIVE1MRWxlbWVudCA9IDxIVE1MRWxlbWVudD5saW5lRWxlbWVudHNbbGluZUVsZW1lbnRzSWR4KytdO1xuICAgICAgICAgICAgaWYgKGxpbmVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGh0bWwgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKFxuICAgICAgICAgICAgICAgICAgICBodG1sLCByb3csICF0aGlzLiR1c2VMaW5lR3JvdXBzKCksIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByb3crKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzY3JvbGxMaW5lcyhjb25maWcpIHtcbiAgICAgICAgdmFyIG9sZENvbmZpZyA9IHRoaXMuY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICBpZiAoIW9sZENvbmZpZyB8fCBvbGRDb25maWcubGFzdFJvdyA8IGNvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIHZhciBlbCA9IHRoaXMuZWxlbWVudDtcbiAgICAgICAgaWYgKG9sZENvbmZpZy5maXJzdFJvdyA8IGNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKG9sZENvbmZpZy5maXJzdFJvdywgY29uZmlnLmZpcnN0Um93IC0gMSk7IHJvdyA+IDA7IHJvdy0tKSB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlQ2hpbGQoZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob2xkQ29uZmlnLmxhc3RSb3cgPiBjb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKGNvbmZpZy5sYXN0Um93ICsgMSwgb2xkQ29uZmlnLmxhc3RSb3cpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmxhc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93IDwgb2xkQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgY29uZmlnLmZpcnN0Um93LCBvbGRDb25maWcuZmlyc3RSb3cgLSAxKTtcbiAgICAgICAgICAgIGlmIChlbC5maXJzdENoaWxkKVxuICAgICAgICAgICAgICAgIGVsLmluc2VydEJlZm9yZShmcmFnbWVudCwgZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZnJhZ21lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5sYXN0Um93ID4gb2xkQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHZhciBmcmFnbWVudCA9IHRoaXMuJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBvbGRDb25maWcubGFzdFJvdyArIDEsIGNvbmZpZy5sYXN0Um93KTtcbiAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLmVsZW1lbnQub3duZXJEb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3RSb3cpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSA8SFRNTERpdkVsZW1lbnQ+Y3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAgICAgdmFyIGh0bWwgPSBbXTtcbiAgICAgICAgICAgIC8vIEdldCB0aGUgdG9rZW5zIHBlciBsaW5lIGFzIHRoZXJlIG1pZ2h0IGJlIHNvbWUgbGluZXMgaW4gYmV0d2VlblxuICAgICAgICAgICAgLy8gYmVlaW5nIGZvbGRlZC5cbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckxpbmUoaHRtbCwgcm93LCBmYWxzZSwgcm93ID09IGZvbGRTdGFydCA/IGZvbGRMaW5lIDogZmFsc2UpO1xuXG4gICAgICAgICAgICAvLyBkb24ndCB1c2Ugc2V0SW5uZXJIdG1sIHNpbmNlIHdlIGFyZSB3b3JraW5nIHdpdGggYW4gZW1wdHkgRElWXG4gICAgICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbC5qb2luKFwiXCIpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZUxpbmVHcm91cHMoKSkge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5jbGFzc05hbWUgPSAnYWNlX2xpbmVfZ3JvdXAnO1xuICAgICAgICAgICAgICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpICsgXCJweFwiO1xuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChjb250YWluZXIuZmlyc3RDaGlsZClcbiAgICAgICAgICAgICAgICAgICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByb3crKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZnJhZ21lbnQ7XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZShjb25maWcpIHtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgdmFyIGh0bWwgPSBbXTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gY29uZmlnLmZpcnN0Um93LCBsYXN0Um93ID0gY29uZmlnLmxhc3RSb3c7XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0Um93O1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93ID4gbGFzdFJvdylcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZUxpbmVHcm91cHMoKSlcbiAgICAgICAgICAgICAgICBodG1sLnB1c2goXCI8ZGl2IGNsYXNzPSdhY2VfbGluZV9ncm91cCcgc3R5bGU9J2hlaWdodDpcIiwgY29uZmlnLmxpbmVIZWlnaHQgKiB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKHJvdyksIFwicHgnPlwiKVxuXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKGh0bWwsIHJvdywgZmFsc2UsIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZUxpbmVHcm91cHMoKSlcbiAgICAgICAgICAgICAgICBodG1sLnB1c2goXCI8L2Rpdj5cIik7IC8vIGVuZCB0aGUgbGluZSBncm91cFxuXG4gICAgICAgICAgICByb3crKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbC5qb2luKFwiXCIpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyVG9rZW4oc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLCB0b2tlbiwgdmFsdWUpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVwbGFjZVJlZyA9IC9cXHR8Jnw8fCggKyl8KFtcXHgwMC1cXHgxZlxceDgwLVxceGEwXFx1MTY4MFxcdTE4MEVcXHUyMDAwLVxcdTIwMGZcXHUyMDI4XFx1MjAyOVxcdTIwMkZcXHUyMDVGXFx1MzAwMFxcdUZFRkZdKXxbXFx1MTEwMC1cXHUxMTVGXFx1MTFBMy1cXHUxMUE3XFx1MTFGQS1cXHUxMUZGXFx1MjMyOS1cXHUyMzJBXFx1MkU4MC1cXHUyRTk5XFx1MkU5Qi1cXHUyRUYzXFx1MkYwMC1cXHUyRkQ1XFx1MkZGMC1cXHUyRkZCXFx1MzAwMC1cXHUzMDNFXFx1MzA0MS1cXHUzMDk2XFx1MzA5OS1cXHUzMEZGXFx1MzEwNS1cXHUzMTJEXFx1MzEzMS1cXHUzMThFXFx1MzE5MC1cXHUzMUJBXFx1MzFDMC1cXHUzMUUzXFx1MzFGMC1cXHUzMjFFXFx1MzIyMC1cXHUzMjQ3XFx1MzI1MC1cXHUzMkZFXFx1MzMwMC1cXHU0REJGXFx1NEUwMC1cXHVBNDhDXFx1QTQ5MC1cXHVBNEM2XFx1QTk2MC1cXHVBOTdDXFx1QUMwMC1cXHVEN0EzXFx1RDdCMC1cXHVEN0M2XFx1RDdDQi1cXHVEN0ZCXFx1RjkwMC1cXHVGQUZGXFx1RkUxMC1cXHVGRTE5XFx1RkUzMC1cXHVGRTUyXFx1RkU1NC1cXHVGRTY2XFx1RkU2OC1cXHVGRTZCXFx1RkYwMS1cXHVGRjYwXFx1RkZFMC1cXHVGRkU2XS9nO1xuICAgICAgICB2YXIgcmVwbGFjZUZ1bmMgPSBmdW5jdGlvbihjLCBhLCBiLCB0YWJJZHgsIGlkeDQpIHtcbiAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGYuc2hvd0ludmlzaWJsZXMgP1xuICAgICAgICAgICAgICAgICAgICBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfc3BhY2UnPlwiICsgc3RyaW5nUmVwZWF0KHNlbGYuU1BBQ0VfQ0hBUiwgYy5sZW5ndGgpICsgXCI8L3NwYW4+XCIgOlxuICAgICAgICAgICAgICAgICAgICBzdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCBjLmxlbmd0aCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCImXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCImIzM4O1wiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiPFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiJiM2MDtcIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIlxcdFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRhYlNpemUgPSBzZWxmLnNlc3Npb24uZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW4gKyB0YWJJZHgpO1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSB0YWJTaXplIC0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi4kdGFiU3RyaW5nc1t0YWJTaXplXTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIlxcdTMwMDBcIikge1xuICAgICAgICAgICAgICAgIC8vIFUrMzAwMCBpcyBib3RoIGludmlzaWJsZSBBTkQgZnVsbC13aWR0aCwgc28gbXVzdCBiZSBoYW5kbGVkIHVuaXF1ZWx5XG4gICAgICAgICAgICAgICAgdmFyIGNsYXNzVG9Vc2UgPSBzZWxmLnNob3dJbnZpc2libGVzID8gXCJhY2VfY2prIGFjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZVwiIDogXCJhY2VfY2prXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlID0gc2VsZi5zaG93SW52aXNpYmxlcyA/IHNlbGYuU1BBQ0VfQ0hBUiA6IFwiXCI7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NUb1VzZSArIFwiJyBzdHlsZT0nd2lkdGg6XCIgK1xuICAgICAgICAgICAgICAgICAgICAoc2VsZi5jb25maWcuY2hhcmFjdGVyV2lkdGggKiAyKSArXG4gICAgICAgICAgICAgICAgICAgIFwicHgnPlwiICsgc3BhY2UgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfc3BhY2UgYWNlX2ludmFsaWQnPlwiICsgc2VsZi5TUEFDRV9DSEFSICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdhY2VfY2prJyBzdHlsZT0nd2lkdGg6XCIgK1xuICAgICAgICAgICAgICAgICAgICAoc2VsZi5jb25maWcuY2hhcmFjdGVyV2lkdGggKiAyKSArXG4gICAgICAgICAgICAgICAgICAgIFwicHgnPlwiICsgYyArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG91dHB1dCA9IHZhbHVlLnJlcGxhY2UocmVwbGFjZVJlZywgcmVwbGFjZUZ1bmMpO1xuXG4gICAgICAgIGlmICghdGhpcy4kdGV4dFRva2VuW3Rva2VuLnR5cGVdKSB7XG4gICAgICAgICAgICB2YXIgY2xhc3NlcyA9IFwiYWNlX1wiICsgdG9rZW4udHlwZS5yZXBsYWNlKC9cXC4vZywgXCIgYWNlX1wiKTtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAodG9rZW4udHlwZSA9PSBcImZvbGRcIilcbiAgICAgICAgICAgICAgICBzdHlsZSA9IFwiIHN0eWxlPSd3aWR0aDpcIiArICh0b2tlbi52YWx1ZS5sZW5ndGggKiB0aGlzLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCkgKyBcInB4OycgXCI7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXCI8c3BhbiBjbGFzcz0nXCIsIGNsYXNzZXMsIFwiJ1wiLCBzdHlsZSwgXCI+XCIsIG91dHB1dCwgXCI8L3NwYW4+XCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKG91dHB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNjcmVlbkNvbHVtbiArIHZhbHVlLmxlbmd0aDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXIsIHZhbHVlLCBtYXg/KSB7XG4gICAgICAgIHZhciBjb2xzID0gdmFsdWUuc2VhcmNoKHRoaXMuJGluZGVudEd1aWRlUmUpO1xuICAgICAgICBpZiAoY29scyA8PSAwIHx8IGNvbHMgPj0gbWF4KVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBpZiAodmFsdWVbMF0gPT0gXCIgXCIpIHtcbiAgICAgICAgICAgIGNvbHMgLT0gY29scyAlIHRoaXMudGFiU2l6ZTtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChzdHJpbmdSZXBlYXQodGhpcy4kdGFiU3RyaW5nc1tcIiBcIl0sIGNvbHMgLyB0aGlzLnRhYlNpemUpKTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5zdWJzdHIoY29scyk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVbMF0gPT0gXCJcXHRcIikge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKHN0cmluZ1JlcGVhdCh0aGlzLiR0YWJTdHJpbmdzW1wiXFx0XCJdLCBjb2xzKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJXcmFwcGVkTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnM6IHsgdmFsdWU6IHN0cmluZyB9W10sIHNwbGl0czogbnVtYmVyW10sIG9ubHlDb250ZW50cykge1xuICAgICAgICB2YXIgY2hhcnMgPSAwO1xuICAgICAgICB2YXIgc3BsaXQgPSAwO1xuICAgICAgICB2YXIgc3BsaXRDaGFycyA9IHNwbGl0c1swXTtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGkgPT0gMCAmJiB0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgICAgICBjaGFycyA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUsIHNwbGl0Q2hhcnMpO1xuICAgICAgICAgICAgICAgIGlmICghdmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNoYXJzIC09IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoYXJzICsgdmFsdWUubGVuZ3RoIDwgc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChjaGFycyArIHZhbHVlLmxlbmd0aCA+PSBzcGxpdENoYXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4sIHZhbHVlLnN1YnN0cmluZygwLCBzcGxpdENoYXJzIC0gY2hhcnMpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKHNwbGl0Q2hhcnMgLSBjaGFycyk7XG4gICAgICAgICAgICAgICAgICAgIGNoYXJzID0gc3BsaXRDaGFycztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0LCBcInB4Jz5cIlxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Kys7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Q2hhcnMgPSBzcGxpdHNbc3BsaXRdIHx8IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLCB0b2tlbiwgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJTaW1wbGVMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucykge1xuICAgICAgICB2YXIgc2NyZWVuQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIHRva2VuID0gdG9rZW5zWzBdO1xuICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGxheUluZGVudEd1aWRlcylcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5yZW5kZXJJbmRlbnRHdWlkZShzdHJpbmdCdWlsZGVyLCB2YWx1ZSk7XG4gICAgICAgIGlmICh2YWx1ZSlcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHJvdyBpcyBlaXRoZXIgZmlyc3Qgcm93IG9mIGZvbGRsaW5lIG9yIG5vdCBpbiBmb2xkXG4gICAgcHJpdmF0ZSAkcmVuZGVyTGluZShzdHJpbmdCdWlsZGVyLCByb3c6IG51bWJlciwgb25seUNvbnRlbnRzLCBmb2xkTGluZSkge1xuICAgICAgICBpZiAoIWZvbGRMaW5lICYmIGZvbGRMaW5lICE9IGZhbHNlKVxuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZExpbmUocm93KTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBhbnlbXSA9IHRoaXMuJGdldEZvbGRMaW5lVG9rZW5zKHJvdywgZm9sZExpbmUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBhbnlbXSA9IHRoaXMuc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuXG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXG4gICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0ICogKFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1c2VMaW5lR3JvdXBzKCkgPyAxIDogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpXG4gICAgICAgICAgICAgICAgKSwgXCJweCc+XCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSB0aGlzLnNlc3Npb24uZ2V0Um93U3BsaXREYXRhKHJvdyk7XG4gICAgICAgICAgICBpZiAoc3BsaXRzICYmIHNwbGl0cy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zLCBzcGxpdHMsIG9ubHlDb250ZW50cyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93XG5cbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcbiAgICAgICAgICAgICAgICBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfZW9sJz5cIixcbiAgICAgICAgICAgICAgICByb3cgPT0gdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpIC0gMSA/IHRoaXMuRU9GX0NIQVIgOiB0aGlzLkVPTF9DSEFSLFxuICAgICAgICAgICAgICAgIFwiPC9zcGFuPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKVxuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldEZvbGRMaW5lVG9rZW5zKHJvdzogbnVtYmVyLCBmb2xkTGluZSk6IHt9W10ge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJlbmRlclRva2VuczogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkVG9rZW5zKHRva2VuczogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBpZHggPSAwLCBjb2wgPSAwO1xuICAgICAgICAgICAgd2hpbGUgKChjb2wgKyB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGgpIDwgZnJvbSkge1xuICAgICAgICAgICAgICAgIGNvbCArPSB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09IHRva2Vucy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb2wgIT0gZnJvbSkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlLnN1YnN0cmluZyhmcm9tIC0gY29sKTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdG9rZW4gdmFsdWUgaXMgbG9uZ2VyIHRoZW4gdGhlIGZyb20uLi50byBzcGFjaW5nLlxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAodG8gLSBmcm9tKSlcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgdG8gLSBmcm9tKTtcblxuICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW5zW2lkeF0udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjb2wgPSBmcm9tICsgdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAoY29sIDwgdG8gJiYgaWR4IDwgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggKyBjb2wgPiB0bykge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbnNbaWR4XS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLnN1YnN0cmluZygwLCB0byAtIGNvbClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHRva2Vuc1tpZHhdKTtcbiAgICAgICAgICAgICAgICBjb2wgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VucyA9IHNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uLCBpc05ld1Jvdykge1xuICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChpc05ld1JvdylcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICBhZGRUb2tlbnModG9rZW5zLCBsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmb2xkTGluZS5lbmQucm93LCB0aGlzLnNlc3Npb24uZ2V0TGluZShmb2xkTGluZS5lbmQucm93KS5sZW5ndGgpO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJUb2tlbnM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXNlTGluZUdyb3VwcygpIHtcbiAgICAgICAgLy8gRm9yIHRoZSB1cGRhdGVMaW5lcyBmdW5jdGlvbiB0byB3b3JrIGNvcnJlY3RseSwgaXQncyBpbXBvcnRhbnQgdGhhdCB0aGVcbiAgICAgICAgLy8gY2hpbGQgbm9kZXMgb2YgdGhpcy5lbGVtZW50IGNvcnJlc3BvbmQgb24gYSAxLXRvLTEgYmFzaXMgdG8gcm93cyBpbiB0aGVcbiAgICAgICAgLy8gZG9jdW1lbnQgKGFzIGRpc3RpbmN0IGZyb20gbGluZXMgb24gdGhlIHNjcmVlbikuIEZvciBzZXNzaW9ucyB0aGF0IGFyZVxuICAgICAgICAvLyB3cmFwcGVkLCB0aGlzIG1lYW5zIHdlIG5lZWQgdG8gYWRkIGEgbGF5ZXIgdG8gdGhlIG5vZGUgaGllcmFyY2h5ICh0YWdnZWRcbiAgICAgICAgLy8gd2l0aCB0aGUgY2xhc3MgbmFtZSBhY2VfbGluZV9ncm91cCkuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLiRwb2xsU2l6ZUNoYW5nZXNUaW1lcik7XG4gICAgICAgIGlmICh0aGlzLiRtZWFzdXJlTm9kZSlcbiAgICAgICAgICAgIHRoaXMuJG1lYXN1cmVOb2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kbWVhc3VyZU5vZGUpO1xuICAgICAgICBkZWxldGUgdGhpcy4kbWVhc3VyZU5vZGU7XG4gICAgfVxufVxuIl19