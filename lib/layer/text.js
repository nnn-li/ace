export class Text extends eve.EventEmitterClass {
    constructor(parentEl) {
        super();
        this.element = dom.createElement("div");
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
                    + lang.stringRepeat("\xa0", i - 1)
                    + "</span>");
            }
            else {
                tabStr.push(lang.stringRepeat("\xa0", i));
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
                var spaceContent = lang.stringRepeat(this.SPACE_CHAR, this.tabSize);
                var tabContent = this.TAB_CHAR + lang.stringRepeat("\xa0", this.tabSize - 1);
            }
            else {
                var spaceContent = lang.stringRepeat("\xa0", this.tabSize);
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
            var container = dom.createElement("div");
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
                    "<span class='ace_invisible ace_invisible_space'>" + lang.stringRepeat(self.SPACE_CHAR, c.length) + "</span>" :
                    lang.stringRepeat("\xa0", c.length);
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
            stringBuilder.push(lang.stringRepeat(this.$tabStrings[" "], cols / this.tabSize));
            return value.substr(cols);
        }
        else if (value[0] == "\t") {
            stringBuilder.push(lang.stringRepeat(this.$tabStrings["\t"], cols));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9sYXllci90ZXh0LnRzIl0sIm5hbWVzIjpbIlRleHQiLCJUZXh0LmNvbnN0cnVjdG9yIiwiVGV4dC4kdXBkYXRlRW9sQ2hhciIsIlRleHQuc2V0UGFkZGluZyIsIlRleHQuZ2V0TGluZUhlaWdodCIsIlRleHQuZ2V0Q2hhcmFjdGVyV2lkdGgiLCJUZXh0LiRzZXRGb250TWV0cmljcyIsIlRleHQuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIlRleHQuJHBvbGxTaXplQ2hhbmdlcyIsIlRleHQuc2V0U2Vzc2lvbiIsIlRleHQuc2V0U2hvd0ludmlzaWJsZXMiLCJUZXh0LnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJUZXh0Lm9uQ2hhbmdlVGFiU2l6ZSIsIlRleHQuJGNvbXB1dGVUYWJTdHJpbmciLCJUZXh0LnVwZGF0ZUxpbmVzIiwiVGV4dC5zY3JvbGxMaW5lcyIsIlRleHQuJHJlbmRlckxpbmVzRnJhZ21lbnQiLCJUZXh0LnVwZGF0ZSIsIlRleHQuJHJlbmRlclRva2VuIiwiVGV4dC5yZW5kZXJJbmRlbnRHdWlkZSIsIlRleHQuJHJlbmRlcldyYXBwZWRMaW5lIiwiVGV4dC4kcmVuZGVyU2ltcGxlTGluZSIsIlRleHQuJHJlbmRlckxpbmUiLCJUZXh0LiRnZXRGb2xkTGluZVRva2VucyIsIlRleHQuJGdldEZvbGRMaW5lVG9rZW5zLmFkZFRva2VucyIsIlRleHQuJHVzZUxpbmVHcm91cHMiLCJUZXh0LmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJBQXNDQSwwQkFBMEIsR0FBRyxDQUFDLGlCQUFpQjtJQW9CM0NBLFlBQVlBLFFBQXFCQTtRQUM3QkMsT0FBT0EsQ0FBQ0E7UUFwQkxBLFlBQU9BLEdBQW1CQSxHQUFHQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNsREEsYUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsYUFBUUEsR0FBR0EsTUFBTUEsQ0FBQ0E7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QUFDQSxRQUFRQSxJQUFJQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXJCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBO1FBQzNDQSxJQUFJQSxlQUFlQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUV4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0EsR0FBR0EsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDakRBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzdDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtvQkFDM0JBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLEdBQUdBLEdBQUdBLFFB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QUV2Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDeEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ2pDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ2RBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQTtnQkFDQUEsRUFBRUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3hGQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT2Ysb0JBQW9CQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxFQUFFQSxPQUFPQTtRQUNsRGdCLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLHNCQUFzQkEsRUFBRUEsQ0FBQ0E7UUFDbkVBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBQ25CQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqREEsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekRBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBO1lBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDdkRBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQTtnQkFDZEEsS0FBS0EsQ0FBQ0E7WUFFVkEsSUFBSUEsU0FBU0EsR0FBbUJBLEdBQUdBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXpEQSxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUdkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxLQUFLQSxFQUFFQSxHQUFHQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUd4RUEsU0FBU0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4QkEsU0FBU0EsQ0FBQ0EsU0FBU0EsR0FBR0EsZ0JBQWdCQSxDQUFDQTtnQkFDdkNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUNoQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7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Q0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDbEJBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2hFQSxPQUFPQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7QUFDTDFCLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgb29wID0gcmVxdWlyZShcIi4uL2xpYi9vb3BcIik7XG5pbXBvcnQgZG9tID0gcmVxdWlyZShcIi4uL2xpYi9kb21cIik7XG5pbXBvcnQgbGFuZyA9IHJlcXVpcmUoXCIuLi9saWIvbGFuZ1wiKTtcbmltcG9ydCB1c2VyYWdlbnQgPSByZXF1aXJlKFwiLi4vbGliL3VzZXJhZ2VudFwiKTtcbmltcG9ydCBlc20gPSByZXF1aXJlKFwiLi4vZWRpdF9zZXNzaW9uXCIpO1xuaW1wb3J0IGV2ZSA9IHJlcXVpcmUoXCIuLi9saWIvZXZlbnRfZW1pdHRlclwiKTtcbmltcG9ydCBmbW0gPSByZXF1aXJlKFwiLi4vbGF5ZXIvZm9udF9tZXRyaWNzXCIpO1xuXG5leHBvcnQgY2xhc3MgVGV4dCBleHRlbmRzIGV2ZS5FdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIGVsZW1lbnQgPSA8SFRNTERpdkVsZW1lbnQ+ZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcHJpdmF0ZSAkcGFkZGluZyA9IDA7XG4gICAgcHJpdmF0ZSBFT0ZfQ0hBUiA9IFwiXFx4QjZcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSX0xGID0gXCJcXHhBQ1wiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfQ1JMRiA9IFwiXFx4YTRcIjtcbiAgICBwcml2YXRlIEVPTF9DSEFSO1xuICAgIHByaXZhdGUgVEFCX0NIQVIgPSBcIlxcdTIxOTJcIjsgLy9cIlxcdTIxRTVcIjtcbiAgICBwcml2YXRlIFNQQUNFX0NIQVIgPSBcIlxceEI3XCI7XG4gICAgcHJpdmF0ZSAkZm9udE1ldHJpY3M6IGZtbS5Gb250TWV0cmljcztcbiAgICBwcml2YXRlIHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlICRwb2xsU2l6ZUNoYW5nZXNUaW1lcjtcbiAgICBwcml2YXRlIHNob3dJbnZpc2libGVzID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlICR0YWJTdHJpbmdzID0gW107XG4gICAgcHJpdmF0ZSAkdGV4dFRva2VuID0geyBcInRleHRcIjogdHJ1ZSwgXCJycGFyZW5cIjogdHJ1ZSwgXCJscGFyZW5cIjogdHJ1ZSB9O1xuICAgIHByaXZhdGUgdGFiU2l6ZTtcbiAgICBwcml2YXRlICRpbmRlbnRHdWlkZVJlO1xuICAgIHB1YmxpYyBjb25maWc7XG4gICAgcHJpdmF0ZSAkbWVhc3VyZU5vZGU7XG4gICAgY29uc3RydWN0b3IocGFyZW50RWw6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSBcImFjZV9sYXllciBhY2VfdGV4dC1sYXllclwiO1xuICAgICAgICBwYXJlbnRFbC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuICAgICAgICB0aGlzLiR1cGRhdGVFb2xDaGFyID0gdGhpcy4kdXBkYXRlRW9sQ2hhci5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLkVPTF9DSEFSID0gdGhpcy5FT0xfQ0hBUl9MRjtcbiAgICB9XG5cbiAgICAkdXBkYXRlRW9sQ2hhcigpIHtcbiAgICAgICAgdmFyIEVPTF9DSEFSID0gdGhpcy5zZXNzaW9uLmRvYy5nZXROZXdMaW5lQ2hhcmFjdGVyKCkgPT0gXCJcXG5cIlxuICAgICAgICAgICAgPyB0aGlzLkVPTF9DSEFSX0xGXG4gICAgICAgICAgICA6IHRoaXMuRU9MX0NIQVJfQ1JMRjtcbiAgICAgICAgaWYgKHRoaXMuRU9MX0NIQVIgIT0gRU9MX0NIQVIpIHtcbiAgICAgICAgICAgIHRoaXMuRU9MX0NIQVIgPSBFT0xfQ0hBUjtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IFwiMCBcIiArIHBhZGRpbmcgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldExpbmVIZWlnaHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS5oZWlnaHQgfHwgMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q2hhcmFjdGVyV2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS53aWR0aCB8fCAwO1xuICAgIH1cblxuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MobWVhc3VyZSkge1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcyA9IG1lYXN1cmU7XG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzLm9uKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGUpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLiRwb2xsU2l6ZUNoYW5nZXMoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgY2hlY2tGb3JTaXplQ2hhbmdlcygpIHtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MuY2hlY2tGb3JTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHBvbGxTaXplQ2hhbmdlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHBvbGxTaXplQ2hhbmdlc1RpbWVyID0gdGhpcy4kZm9udE1ldHJpY3MuJHBvbGxTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBzZXRTZXNzaW9uKHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlczogYm9vbGVhbikge1xuICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcyA9PT0gc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2hvd0ludmlzaWJsZXMgPSBzaG93SW52aXNpYmxlcztcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGxheUluZGVudEd1aWRlcyA9PT0gZGlzcGxheUluZGVudEd1aWRlcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzID0gZGlzcGxheUluZGVudEd1aWRlcztcbiAgICAgICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRklYTUU6IERHSCBDaGVjayB0aGF0IHRoaXMgaXMgY29uc2lzdGVudCB3aXRoIEFDRVxuICAgIHB1YmxpYyBvbkNoYW5nZVRhYlNpemUoKSB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKVxuICAgIH1cblxuICAgIC8vICAgIHRoaXMub25DaGFuZ2VUYWJTaXplID1cbiAgICBwcml2YXRlICRjb21wdXRlVGFiU3RyaW5nKCkge1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHRoaXMudGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICAgIHZhciB0YWJTdHIgPSB0aGlzLiR0YWJTdHJpbmdzID0gW1wiMFwiXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0YWJTaXplICsgMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV90YWInPlwiXG4gICAgICAgICAgICAgICAgICAgICsgdGhpcy5UQUJfQ0hBUlxuICAgICAgICAgICAgICAgICAgICArIGxhbmcuc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgaSAtIDEpXG4gICAgICAgICAgICAgICAgICAgICsgXCI8L3NwYW4+XCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0YWJTdHIucHVzaChsYW5nLnN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICB0aGlzLiRpbmRlbnRHdWlkZVJlID0gL1xcc1xcU3wgXFx0fFxcdCB8XFxzJC87XG4gICAgICAgICAgICB2YXIgY2xhc3NOYW1lID0gXCJhY2VfaW5kZW50LWd1aWRlXCI7XG4gICAgICAgICAgICB2YXIgc3BhY2VDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICB2YXIgdGFiQ2xhc3MgPSBcIlwiO1xuICAgICAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgKz0gXCIgYWNlX2ludmlzaWJsZVwiO1xuICAgICAgICAgICAgICAgIHNwYWNlQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3NwYWNlXCI7XG4gICAgICAgICAgICAgICAgdGFiQ2xhc3MgPSBcIiBhY2VfaW52aXNpYmxlX3RhYlwiO1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZUNvbnRlbnQgPSBsYW5nLnN0cmluZ1JlcGVhdCh0aGlzLlNQQUNFX0NIQVIsIHRoaXMudGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHRhYkNvbnRlbnQgPSB0aGlzLlRBQl9DSEFSICsgbGFuZy5zdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCB0aGlzLnRhYlNpemUgLSAxKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlQ29udGVudCA9IGxhbmcuc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgdGhpcy50YWJTaXplKTtcbiAgICAgICAgICAgICAgICB2YXIgdGFiQ29udGVudCA9IHNwYWNlQ29udGVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIiBcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHNwYWNlQ2xhc3MgKyBcIic+XCIgKyBzcGFjZUNvbnRlbnQgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIHRoaXMuJHRhYlN0cmluZ3NbXCJcXHRcIl0gPSBcIjxzcGFuIGNsYXNzPSdcIiArIGNsYXNzTmFtZSArIHRhYkNsYXNzICsgXCInPlwiICsgdGFiQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHVwZGF0ZUxpbmVzKGNvbmZpZzogeyBmaXJzdFJvdzogbnVtYmVyOyBsYXN0Um93OiBudW1iZXI7IGxpbmVIZWlnaHQ6IG51bWJlciB9LCBmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gRHVlIHRvIHdyYXAgbGluZSBjaGFuZ2VzIHRoZXJlIGNhbiBiZSBuZXcgbGluZXMgaWYgZS5nLlxuICAgICAgICAvLyB0aGUgbGluZSB0byB1cGRhdGVkIHdyYXBwZWQgaW4gdGhlIG1lYW50aW1lLlxuICAgICAgICBpZiAodGhpcy5jb25maWcubGFzdFJvdyAhPSBjb25maWcubGFzdFJvdyB8fFxuICAgICAgICAgICAgdGhpcy5jb25maWcuZmlyc3RSb3cgIT0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbExpbmVzKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgdmFyIGZpcnN0ID0gTWF0aC5tYXgoZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyk7XG4gICAgICAgIHZhciBsYXN0ID0gTWF0aC5taW4obGFzdFJvdywgY29uZmlnLmxhc3RSb3cpO1xuXG4gICAgICAgIHZhciBsaW5lRWxlbWVudHMgPSB0aGlzLmVsZW1lbnQuY2hpbGROb2RlcztcbiAgICAgICAgdmFyIGxpbmVFbGVtZW50c0lkeCA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgcm93ID0gY29uZmlnLmZpcnN0Um93OyByb3cgPCBmaXJzdDsgcm93KyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmNvbnRhaW5zUm93KGZpcnN0KSkge1xuICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsaW5lRWxlbWVudHNJZHgrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdDtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3QpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIHZhciBsaW5lRWxlbWVudDogSFRNTEVsZW1lbnQgPSA8SFRNTEVsZW1lbnQ+bGluZUVsZW1lbnRzW2xpbmVFbGVtZW50c0lkeCsrXTtcbiAgICAgICAgICAgIGlmIChsaW5lRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShcbiAgICAgICAgICAgICAgICAgICAgaHRtbCwgcm93LCAhdGhpcy4kdXNlTGluZUdyb3VwcygpLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKiB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKHJvdykgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgbGluZUVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbC5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgc2Nyb2xsTGluZXMoY29uZmlnKSB7XG4gICAgICAgIHZhciBvbGRDb25maWcgPSB0aGlzLmNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG5cbiAgICAgICAgaWYgKCFvbGRDb25maWcgfHwgb2xkQ29uZmlnLmxhc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICBpZiAoY29uZmlnLmxhc3RSb3cgPCBvbGRDb25maWcuZmlyc3RSb3cpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy51cGRhdGUoY29uZmlnKTtcblxuICAgICAgICB2YXIgZWwgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIGlmIChvbGRDb25maWcuZmlyc3RSb3cgPCBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShvbGRDb25maWcuZmlyc3RSb3csIGNvbmZpZy5maXJzdFJvdyAtIDEpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9sZENvbmZpZy5sYXN0Um93ID4gY29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBER0ggZ2V0Rm9sZGVkUm93Q291bnQgZG9lcyBub3QgZXhpc3Qgb24gRWRpdFNlc3Npb25cbiAgICAgICAgICAgIGZvciAodmFyIHJvdyA9IHRoaXMuc2Vzc2lvblsnZ2V0Rm9sZGVkUm93Q291bnQnXShjb25maWcubGFzdFJvdyArIDEsIG9sZENvbmZpZy5sYXN0Um93KTsgcm93ID4gMDsgcm93LS0pIHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVDaGlsZChlbC5sYXN0Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5maXJzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy4kcmVuZGVyTGluZXNGcmFnbWVudChjb25maWcsIGNvbmZpZy5maXJzdFJvdywgb2xkQ29uZmlnLmZpcnN0Um93IC0gMSk7XG4gICAgICAgICAgICBpZiAoZWwuZmlyc3RDaGlsZClcbiAgICAgICAgICAgICAgICBlbC5pbnNlcnRCZWZvcmUoZnJhZ21lbnQsIGVsLmZpcnN0Q2hpbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA+IG9sZENvbmZpZy5sYXN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgb2xkQ29uZmlnLmxhc3RSb3cgKyAxLCBjb25maWcubGFzdFJvdyk7XG4gICAgICAgICAgICBlbC5hcHBlbmRDaGlsZChmcmFnbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gPEhUTUxEaXZFbGVtZW50PmRvbS5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgICAgICAgICB2YXIgaHRtbCA9IFtdO1xuICAgICAgICAgICAgLy8gR2V0IHRoZSB0b2tlbnMgcGVyIGxpbmUgYXMgdGhlcmUgbWlnaHQgYmUgc29tZSBsaW5lcyBpbiBiZXR3ZWVuXG4gICAgICAgICAgICAvLyBiZWVpbmcgZm9sZGVkLlxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShodG1sLCByb3csIGZhbHNlLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZSk7XG5cbiAgICAgICAgICAgIC8vIGRvbid0IHVzZSBzZXRJbm5lckh0bWwgc2luY2Ugd2UgYXJlIHdvcmtpbmcgd2l0aCBhbiBlbXB0eSBESVZcbiAgICAgICAgICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlTGluZUdyb3VwcygpKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmNsYXNzTmFtZSA9ICdhY2VfbGluZV9ncm91cCc7XG4gICAgICAgICAgICAgICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKiB0aGlzLnNlc3Npb24uZ2V0Um93TGVuZ3RoKHJvdykgKyBcInB4XCI7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGNvbnRhaW5lci5maXJzdENoaWxkKVxuICAgICAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJvdysrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmcmFnbWVudDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlKGNvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICB2YXIgaHRtbCA9IFtdO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBjb25maWcuZmlyc3RSb3csIGxhc3RSb3cgPSBjb25maWcubGFzdFJvdztcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlTGluZUdyb3VwcygpKVxuICAgICAgICAgICAgICAgIGh0bWwucHVzaChcIjxkaXYgY2xhc3M9J2FjZV9saW5lX2dyb3VwJyBzdHlsZT0naGVpZ2h0OlwiLCBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSwgXCJweCc+XCIpXG5cbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckxpbmUoaHRtbCwgcm93LCBmYWxzZSwgcm93ID09IGZvbGRTdGFydCA/IGZvbGRMaW5lIDogZmFsc2UpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlTGluZUdyb3VwcygpKVxuICAgICAgICAgICAgICAgIGh0bWwucHVzaChcIjwvZGl2PlwiKTsgLy8gZW5kIHRoZSBsaW5lIGdyb3VwXG5cbiAgICAgICAgICAgIHJvdysrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWxlbWVudC5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXBsYWNlUmVnID0gL1xcdHwmfDx8KCArKXwoW1xceDAwLVxceDFmXFx4ODAtXFx4YTBcXHUxNjgwXFx1MTgwRVxcdTIwMDAtXFx1MjAwZlxcdTIwMjhcXHUyMDI5XFx1MjAyRlxcdTIwNUZcXHUzMDAwXFx1RkVGRl0pfFtcXHUxMTAwLVxcdTExNUZcXHUxMUEzLVxcdTExQTdcXHUxMUZBLVxcdTExRkZcXHUyMzI5LVxcdTIzMkFcXHUyRTgwLVxcdTJFOTlcXHUyRTlCLVxcdTJFRjNcXHUyRjAwLVxcdTJGRDVcXHUyRkYwLVxcdTJGRkJcXHUzMDAwLVxcdTMwM0VcXHUzMDQxLVxcdTMwOTZcXHUzMDk5LVxcdTMwRkZcXHUzMTA1LVxcdTMxMkRcXHUzMTMxLVxcdTMxOEVcXHUzMTkwLVxcdTMxQkFcXHUzMUMwLVxcdTMxRTNcXHUzMUYwLVxcdTMyMUVcXHUzMjIwLVxcdTMyNDdcXHUzMjUwLVxcdTMyRkVcXHUzMzAwLVxcdTREQkZcXHU0RTAwLVxcdUE0OENcXHVBNDkwLVxcdUE0QzZcXHVBOTYwLVxcdUE5N0NcXHVBQzAwLVxcdUQ3QTNcXHVEN0IwLVxcdUQ3QzZcXHVEN0NCLVxcdUQ3RkJcXHVGOTAwLVxcdUZBRkZcXHVGRTEwLVxcdUZFMTlcXHVGRTMwLVxcdUZFNTJcXHVGRTU0LVxcdUZFNjZcXHVGRTY4LVxcdUZFNkJcXHVGRjAxLVxcdUZGNjBcXHVGRkUwLVxcdUZGRTZdL2c7XG4gICAgICAgIHZhciByZXBsYWNlRnVuYyA9IGZ1bmN0aW9uKGMsIGEsIGIsIHRhYklkeCwgaWR4NCkge1xuICAgICAgICAgICAgaWYgKGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5zaG93SW52aXNpYmxlcyA/XG4gICAgICAgICAgICAgICAgICAgIFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZSc+XCIgKyBsYW5nLnN0cmluZ1JlcGVhdChzZWxmLlNQQUNFX0NIQVIsIGMubGVuZ3RoKSArIFwiPC9zcGFuPlwiIDpcbiAgICAgICAgICAgICAgICAgICAgbGFuZy5zdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCBjLmxlbmd0aCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCImXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCImIzM4O1wiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiPFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiJiM2MDtcIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIlxcdFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRhYlNpemUgPSBzZWxmLnNlc3Npb24uZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW4gKyB0YWJJZHgpO1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSB0YWJTaXplIC0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi4kdGFiU3RyaW5nc1t0YWJTaXplXTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIlxcdTMwMDBcIikge1xuICAgICAgICAgICAgICAgIC8vIFUrMzAwMCBpcyBib3RoIGludmlzaWJsZSBBTkQgZnVsbC13aWR0aCwgc28gbXVzdCBiZSBoYW5kbGVkIHVuaXF1ZWx5XG4gICAgICAgICAgICAgICAgdmFyIGNsYXNzVG9Vc2UgPSBzZWxmLnNob3dJbnZpc2libGVzID8gXCJhY2VfY2prIGFjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZVwiIDogXCJhY2VfY2prXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlID0gc2VsZi5zaG93SW52aXNpYmxlcyA/IHNlbGYuU1BBQ0VfQ0hBUiA6IFwiXCI7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NUb1VzZSArIFwiJyBzdHlsZT0nd2lkdGg6XCIgK1xuICAgICAgICAgICAgICAgICAgICAoc2VsZi5jb25maWcuY2hhcmFjdGVyV2lkdGggKiAyKSArXG4gICAgICAgICAgICAgICAgICAgIFwicHgnPlwiICsgc3BhY2UgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfc3BhY2UgYWNlX2ludmFsaWQnPlwiICsgc2VsZi5TUEFDRV9DSEFSICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIjxzcGFuIGNsYXNzPSdhY2VfY2prJyBzdHlsZT0nd2lkdGg6XCIgK1xuICAgICAgICAgICAgICAgICAgICAoc2VsZi5jb25maWcuY2hhcmFjdGVyV2lkdGggKiAyKSArXG4gICAgICAgICAgICAgICAgICAgIFwicHgnPlwiICsgYyArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG91dHB1dCA9IHZhbHVlLnJlcGxhY2UocmVwbGFjZVJlZywgcmVwbGFjZUZ1bmMpO1xuXG4gICAgICAgIGlmICghdGhpcy4kdGV4dFRva2VuW3Rva2VuLnR5cGVdKSB7XG4gICAgICAgICAgICB2YXIgY2xhc3NlcyA9IFwiYWNlX1wiICsgdG9rZW4udHlwZS5yZXBsYWNlKC9cXC4vZywgXCIgYWNlX1wiKTtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAodG9rZW4udHlwZSA9PSBcImZvbGRcIilcbiAgICAgICAgICAgICAgICBzdHlsZSA9IFwiIHN0eWxlPSd3aWR0aDpcIiArICh0b2tlbi52YWx1ZS5sZW5ndGggKiB0aGlzLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCkgKyBcInB4OycgXCI7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXCI8c3BhbiBjbGFzcz0nXCIsIGNsYXNzZXMsIFwiJ1wiLCBzdHlsZSwgXCI+XCIsIG91dHB1dCwgXCI8L3NwYW4+XCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKG91dHB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNjcmVlbkNvbHVtbiArIHZhbHVlLmxlbmd0aDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXIsIHZhbHVlLCBtYXg/KSB7XG4gICAgICAgIHZhciBjb2xzID0gdmFsdWUuc2VhcmNoKHRoaXMuJGluZGVudEd1aWRlUmUpO1xuICAgICAgICBpZiAoY29scyA8PSAwIHx8IGNvbHMgPj0gbWF4KVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBpZiAodmFsdWVbMF0gPT0gXCIgXCIpIHtcbiAgICAgICAgICAgIGNvbHMgLT0gY29scyAlIHRoaXMudGFiU2l6ZTtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChsYW5nLnN0cmluZ1JlcGVhdCh0aGlzLiR0YWJTdHJpbmdzW1wiIFwiXSwgY29scyAvIHRoaXMudGFiU2l6ZSkpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnN1YnN0cihjb2xzKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZVswXSA9PSBcIlxcdFwiKSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2gobGFuZy5zdHJpbmdSZXBlYXQodGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSwgY29scykpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnN1YnN0cihjb2xzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdLCBzcGxpdHM6IG51bWJlcltdLCBvbmx5Q29udGVudHMpIHtcbiAgICAgICAgdmFyIGNoYXJzID0gMDtcbiAgICAgICAgdmFyIHNwbGl0ID0gMDtcbiAgICAgICAgdmFyIHNwbGl0Q2hhcnMgPSBzcGxpdHNbMF07XG4gICAgICAgIHZhciBzY3JlZW5Db2x1bW4gPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIGlmIChpID09IDAgJiYgdGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICAgICAgY2hhcnMgPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXIsIHZhbHVlLCBzcGxpdENoYXJzKTtcbiAgICAgICAgICAgICAgICBpZiAoIXZhbHVlKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjaGFycyAtPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjaGFycyArIHZhbHVlLmxlbmd0aCA8IHNwbGl0Q2hhcnMpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY2hhcnMgKyB2YWx1ZS5sZW5ndGggPj0gc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuLCB2YWx1ZS5zdWJzdHJpbmcoMCwgc3BsaXRDaGFycyAtIGNoYXJzKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZyhzcGxpdENoYXJzIC0gY2hhcnMpO1xuICAgICAgICAgICAgICAgICAgICBjaGFycyA9IHNwbGl0Q2hhcnM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvbmx5Q29udGVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjwvZGl2PlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCwgXCJweCc+XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzcGxpdCsrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgICAgICBzcGxpdENoYXJzID0gc3BsaXRzW3NwbGl0XSB8fCBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpIHtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1swXTtcbiAgICAgICAgdmFyIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpXG4gICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUpO1xuICAgICAgICBpZiAodmFsdWUpXG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyByb3cgaXMgZWl0aGVyIGZpcnN0IHJvdyBvZiBmb2xkbGluZSBvciBub3QgaW4gZm9sZFxuICAgIHByaXZhdGUgJHJlbmRlckxpbmUoc3RyaW5nQnVpbGRlciwgcm93OiBudW1iZXIsIG9ubHlDb250ZW50cywgZm9sZExpbmUpIHtcbiAgICAgICAgaWYgKCFmb2xkTGluZSAmJiBmb2xkTGluZSAhPSBmYWxzZSlcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lKVxuICAgICAgICAgICAgdmFyIHRva2VuczogYW55W10gPSB0aGlzLiRnZXRGb2xkTGluZVRva2Vucyhyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHRva2VuczogYW55W10gPSB0aGlzLnNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG5cblxuICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFxuICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCAqIChcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXNlTGluZUdyb3VwcygpID8gMSA6IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KVxuICAgICAgICAgICAgICAgICksIFwicHgnPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gdGhpcy5zZXNzaW9uLmdldFJvd1NwbGl0RGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKHNwbGl0cyAmJiBzcGxpdHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRoaXMuJHJlbmRlcldyYXBwZWRMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucywgc3BsaXRzLCBvbmx5Q29udGVudHMpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHJlbmRlclNpbXBsZUxpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvd1xuXG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXG4gICAgICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX2VvbCc+XCIsXG4gICAgICAgICAgICAgICAgcm93ID09IHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSAtIDEgPyB0aGlzLkVPRl9DSEFSIDogdGhpcy5FT0xfQ0hBUixcbiAgICAgICAgICAgICAgICBcIjwvc3Bhbj5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9ubHlDb250ZW50cylcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjwvZGl2PlwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRGb2xkTGluZVRva2Vucyhyb3c6IG51bWJlciwgZm9sZExpbmUpOiB7fVtdIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByZW5kZXJUb2tlbnM6IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFRva2Vucyh0b2tlbnM6IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKSB7XG4gICAgICAgICAgICB2YXIgaWR4ID0gMCwgY29sID0gMDtcbiAgICAgICAgICAgIHdoaWxlICgoY29sICsgdG9rZW5zW2lkeF0udmFsdWUubGVuZ3RoKSA8IGZyb20pIHtcbiAgICAgICAgICAgICAgICBjb2wgKz0gdG9rZW5zW2lkeF0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCsrO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlkeCA9PSB0b2tlbnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29sICE9IGZyb20pIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnNbaWR4XS52YWx1ZS5zdWJzdHJpbmcoZnJvbSAtIGNvbCk7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIHRva2VuIHZhbHVlIGlzIGxvbmdlciB0aGVuIHRoZSBmcm9tLi4udG8gc3BhY2luZy5cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoID4gKHRvIC0gZnJvbSkpXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIHRvIC0gZnJvbSk7XG5cbiAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2Vuc1tpZHhdLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgY29sID0gZnJvbSArIHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZHggKz0gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUgKGNvbCA8IHRvICYmIGlkeCA8IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnNbaWR4XS52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoICsgY29sID4gdG8pIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW5zW2lkeF0udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZS5zdWJzdHJpbmcoMCwgdG8gLSBjb2wpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh0b2tlbnNbaWR4XSk7XG4gICAgICAgICAgICAgICAgY29sICs9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZHggKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbnMgPSBzZXNzaW9uLmdldFRva2Vucyhyb3cpO1xuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbiwgaXNOZXdSb3cpIHtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyVG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImZvbGRcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOZXdSb3cpXG4gICAgICAgICAgICAgICAgICAgIHRva2VucyA9IHNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLmxlbmd0aClcbiAgICAgICAgICAgICAgICAgICAgYWRkVG9rZW5zKHRva2VucywgbGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZm9sZExpbmUuZW5kLnJvdywgdGhpcy5zZXNzaW9uLmdldExpbmUoZm9sZExpbmUuZW5kLnJvdykubGVuZ3RoKTtcblxuICAgICAgICByZXR1cm4gcmVuZGVyVG9rZW5zO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVzZUxpbmVHcm91cHMoKSB7XG4gICAgICAgIC8vIEZvciB0aGUgdXBkYXRlTGluZXMgZnVuY3Rpb24gdG8gd29yayBjb3JyZWN0bHksIGl0J3MgaW1wb3J0YW50IHRoYXQgdGhlXG4gICAgICAgIC8vIGNoaWxkIG5vZGVzIG9mIHRoaXMuZWxlbWVudCBjb3JyZXNwb25kIG9uIGEgMS10by0xIGJhc2lzIHRvIHJvd3MgaW4gdGhlXG4gICAgICAgIC8vIGRvY3VtZW50IChhcyBkaXN0aW5jdCBmcm9tIGxpbmVzIG9uIHRoZSBzY3JlZW4pLiBGb3Igc2Vzc2lvbnMgdGhhdCBhcmVcbiAgICAgICAgLy8gd3JhcHBlZCwgdGhpcyBtZWFucyB3ZSBuZWVkIHRvIGFkZCBhIGxheWVyIHRvIHRoZSBub2RlIGhpZXJhcmNoeSAodGFnZ2VkXG4gICAgICAgIC8vIHdpdGggdGhlIGNsYXNzIG5hbWUgYWNlX2xpbmVfZ3JvdXApLlxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGRlc3Ryb3koKSB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIpO1xuICAgICAgICBpZiAodGhpcy4kbWVhc3VyZU5vZGUpXG4gICAgICAgICAgICB0aGlzLiRtZWFzdXJlTm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuJG1lYXN1cmVOb2RlKTtcbiAgICAgICAgZGVsZXRlIHRoaXMuJG1lYXN1cmVOb2RlO1xuICAgIH1cbn1cbiJdfQ==