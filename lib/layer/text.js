var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var dom = require("../lib/dom");
var lang = require("../lib/lang");
var eve = require("../lib/event_emitter");
var Text = (function (_super) {
    __extends(Text, _super);
    function Text(parentEl) {
        _super.call(this);
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
    Text.prototype.$updateEolChar = function () {
        var EOL_CHAR = this.session.doc.getNewLineCharacter() == "\n"
            ? this.EOL_CHAR_LF
            : this.EOL_CHAR_CRLF;
        if (this.EOL_CHAR != EOL_CHAR) {
            this.EOL_CHAR = EOL_CHAR;
            return true;
        }
    };
    Text.prototype.setPadding = function (padding) {
        this.$padding = padding;
        this.element.style.padding = "0 " + padding + "px";
    };
    Text.prototype.getLineHeight = function () {
        return this.$fontMetrics.$characterSize.height || 0;
    };
    Text.prototype.getCharacterWidth = function () {
        return this.$fontMetrics.$characterSize.width || 0;
    };
    Text.prototype.$setFontMetrics = function (measure) {
        this.$fontMetrics = measure;
        this.$fontMetrics.on("changeCharacterSize", function (e) {
            this._signal("changeCharacterSize", e);
        }.bind(this));
        this.$pollSizeChanges();
    };
    Text.prototype.checkForSizeChanges = function () {
        this.$fontMetrics.checkForSizeChanges();
    };
    Text.prototype.$pollSizeChanges = function () {
        return this.$pollSizeChangesTimer = this.$fontMetrics.$pollSizeChanges();
    };
    Text.prototype.setSession = function (session) {
        this.session = session;
        this.$computeTabString();
    };
    Text.prototype.setShowInvisibles = function (showInvisibles) {
        if (this.showInvisibles === showInvisibles) {
            return false;
        }
        else {
            this.showInvisibles = showInvisibles;
            this.$computeTabString();
            return true;
        }
    };
    Text.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
        if (this.displayIndentGuides === displayIndentGuides) {
            return false;
        }
        else {
            this.displayIndentGuides = displayIndentGuides;
            this.$computeTabString();
            return true;
        }
    };
    Text.prototype.onChangeTabSize = function () {
        this.$computeTabString();
    };
    Text.prototype.$computeTabString = function () {
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
    };
    Text.prototype.updateLines = function (config, firstRow, lastRow) {
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
    };
    Text.prototype.scrollLines = function (config) {
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
    };
    Text.prototype.$renderLinesFragment = function (config, firstRow, lastRow) {
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
    };
    Text.prototype.update = function (config) {
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
    };
    Text.prototype.$renderToken = function (stringBuilder, screenColumn, token, value) {
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
    };
    Text.prototype.renderIndentGuide = function (stringBuilder, value, max) {
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
    };
    Text.prototype.$renderWrappedLine = function (stringBuilder, tokens, splits, onlyContents) {
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
    };
    Text.prototype.$renderSimpleLine = function (stringBuilder, tokens) {
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
    };
    Text.prototype.$renderLine = function (stringBuilder, row, onlyContents, foldLine) {
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
    };
    Text.prototype.$getFoldLineTokens = function (row, foldLine) {
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
    };
    Text.prototype.$useLineGroups = function () {
        return this.session.getUseWrapMode();
    };
    Text.prototype.destroy = function () {
        clearInterval(this.$pollSizeChangesTimer);
        if (this.$measureNode)
            this.$measureNode.parentNode.removeChild(this.$measureNode);
        delete this.$measureNode;
    };
    return Text;
})(eve.EventEmitterClass);
exports.Text = Text;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9sYXllci90ZXh0LnRzIl0sIm5hbWVzIjpbIlRleHQiLCJUZXh0LmNvbnN0cnVjdG9yIiwiVGV4dC4kdXBkYXRlRW9sQ2hhciIsIlRleHQuc2V0UGFkZGluZyIsIlRleHQuZ2V0TGluZUhlaWdodCIsIlRleHQuZ2V0Q2hhcmFjdGVyV2lkdGgiLCJUZXh0LiRzZXRGb250TWV0cmljcyIsIlRleHQuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIlRleHQuJHBvbGxTaXplQ2hhbmdlcyIsIlRleHQuc2V0U2Vzc2lvbiIsIlRleHQuc2V0U2hvd0ludmlzaWJsZXMiLCJUZXh0LnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJUZXh0Lm9uQ2hhbmdlVGFiU2l6ZSIsIlRleHQuJGNvbXB1dGVUYWJTdHJpbmciLCJUZXh0LnVwZGF0ZUxpbmVzIiwiVGV4dC5zY3JvbGxMaW5lcyIsIlRleHQuJHJlbmRlckxpbmVzRnJhZ21lbnQiLCJUZXh0LnVwZGF0ZSIsIlRleHQuJHJlbmRlclRva2VuIiwiVGV4dC5yZW5kZXJJbmRlbnRHdWlkZSIsIlRleHQuJHJlbmRlcldyYXBwZWRMaW5lIiwiVGV4dC4kcmVuZGVyU2ltcGxlTGluZSIsIlRleHQuJHJlbmRlckxpbmUiLCJUZXh0LiRnZXRGb2xkTGluZVRva2VucyIsIlRleHQuJGdldEZvbGRMaW5lVG9rZW5zLmFkZFRva2VucyIsIlRleHQuJHVzZUxpbmVHcm91cHMiLCJUZXh0LmRlc3Ryb3kiXSwibWFwcGluZ3MiOiI7Ozs7O0FBK0JBLElBQU8sR0FBRyxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ25DLElBQU8sSUFBSSxXQUFXLGFBQWEsQ0FBQyxDQUFDO0FBR3JDLElBQU8sR0FBRyxXQUFXLHNCQUFzQixDQUFDLENBQUM7QUFHN0M7SUFBMEJBLHdCQUFxQkE7SUFvQjNDQSxjQUFZQSxRQUFxQkE7UUFDN0JDLGlCQUFPQSxDQUFDQTtRQXBCTEEsWUFBT0EsR0FB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QUFDQSxRQUFRQSxDQUFDQTtZQUNwQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUV2Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDeEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2xDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxFQUFFQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdEdBLEVBQUVBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ2pDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxRQUFRQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ2RBLEVBQUVBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQTtnQkFDQUEsRUFBRUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3hGQSxFQUFFQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT2YsbUNBQW9CQSxHQUE1QkEsVUFBNkJBLE1BQU1BLEVBQUVBLFFBQVFBLEVBQUVBLE9BQU9BO1FBQ2xEZ0IsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0Esc0JBQXNCQSxFQUFFQSxDQUFDQTtRQUNuRUEsSUFBSUEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbkJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUV6REEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDM0JBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUN2REEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDekRBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBO2dCQUNkQSxLQUFLQSxDQUFDQTtZQUVWQSxJQUFJQSxTQUFTQSxHQUFtQkEsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFekRBLElBQUlBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO1lBR2RBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLEdBQUdBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBO1lBR3hFQSxTQUFTQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxTQUFTQSxDQUFDQSxTQUFTQSxHQUFHQSxnQkFBZ0JBLENBQUNBO2dCQUN2Q0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUV2RkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLE9BQU9BLFNBQVNBLENBQUNBLFVBQVVBO29CQUN2QkEsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLENBQUNBO1lBRURBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUVNaEIscUJBQU1BLEdBQWJBLFVBQWNBLE1BQU1BO1FBQ2hCaUIsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFFckJBLElBQUlBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2RBLElBQUlBLFFBQVFBLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBO1FBRXpEQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUNuQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMzQkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZEQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN6REEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLENBQUNBO1lBRVZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO2dCQUN0QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNENBQTRDQSxFQUFFQSxNQUFNQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFBQTtZQUV2SEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsR0FBR0EsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFeEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO2dCQUN0QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFFeEJBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQUdPakIsMkJBQVlBLEdBQXBCQSxVQUFxQkEsYUFBYUEsRUFBRUEsWUFBWUEsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0E7UUFDMURrQixJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNoQkEsSUFBSUEsVUFBVUEsR0FBR0EscWdCQUFxZ0JBLENBQUNBO1FBQ3ZoQkEsSUFBSUEsV0FBV0EsR0FBR0EsVUFBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUE7WUFDNUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWM7b0JBQ3RCLGtEQUFrRCxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsU0FBUztvQkFDN0csSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFDbkIsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDbEIsTUFBTSxDQUFDLE9BQU8sQ0FBQztZQUNuQixDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDbkUsWUFBWSxJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7Z0JBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3JDLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBRXZCLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLEdBQUcsMkNBQTJDLEdBQUcsU0FBUyxDQUFDO2dCQUMvRixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO2dCQUN2RCxZQUFZLElBQUksQ0FBQyxDQUFDO2dCQUNsQixNQUFNLENBQUMsZUFBZSxHQUFHLFVBQVUsR0FBRyxpQkFBaUI7b0JBQ25ELENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO29CQUNoQyxNQUFNLEdBQUcsS0FBSyxHQUFHLFNBQVMsQ0FBQztZQUNuQyxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1gsTUFBTSxDQUFDLDhEQUE4RCxHQUFHLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1lBQ3hHLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixZQUFZLElBQUksQ0FBQyxDQUFDO2dCQUNsQixNQUFNLENBQUMscUNBQXFDO29CQUN4QyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztvQkFDaEMsTUFBTSxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUM7WUFDL0IsQ0FBQztRQUNMLENBQUMsQ0FBQUE7UUFFREEsSUFBSUEsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFFcERBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxJQUFJQSxPQUFPQSxHQUFHQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUMxREEsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsSUFBSUEsTUFBTUEsQ0FBQ0E7Z0JBQ3JCQSxLQUFLQSxHQUFHQSxnQkFBZ0JBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLE9BQU9BLENBQUNBO1lBQzNGQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxPQUFPQSxFQUFFQSxHQUFHQSxFQUFFQSxLQUFLQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNyRkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLFlBQVlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQUVPbEIsZ0NBQWlCQSxHQUF6QkEsVUFBMEJBLGFBQWFBLEVBQUVBLEtBQUtBLEVBQUVBLEdBQUlBO1FBQ2hEbUIsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLEdBQUdBLENBQUNBO1lBQ3pCQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1lBQzVCQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsRkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwRUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUVPbkIsaUNBQWtCQSxHQUExQkEsVUFBMkJBLGFBQWFBLEVBQUVBLE1BQTJCQSxFQUFFQSxNQUFnQkEsRUFBRUEsWUFBWUE7UUFDakdvQixJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxVQUFVQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMzQkEsSUFBSUEsWUFBWUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFckJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDckJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsYUFBYUEsRUFBRUEsS0FBS0EsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFDUEEsUUFBUUEsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1lBQzFCQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLGFBQWFBLEVBQUVBLFlBQVlBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO2dCQUM1RUEsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxPQUFPQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxVQUFVQSxFQUFFQSxDQUFDQTtvQkFDeENBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQzVCQSxhQUFhQSxFQUFFQSxZQUFZQSxFQUMzQkEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsVUFBVUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FDaERBLENBQUNBO29CQUNGQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDNUNBLEtBQUtBLEdBQUdBLFVBQVVBLENBQUNBO29CQUVuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hCQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUN2QkEsc0NBQXNDQSxFQUN0Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsRUFBRUEsTUFBTUEsQ0FDakNBLENBQUNBO29CQUNOQSxDQUFDQTtvQkFFREEsS0FBS0EsRUFBRUEsQ0FBQ0E7b0JBQ1JBLFlBQVlBLEdBQUdBLENBQUNBLENBQUNBO29CQUNqQkEsVUFBVUEsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQ25EQSxDQUFDQTtnQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtvQkFDdEJBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQzVCQSxhQUFhQSxFQUFFQSxZQUFZQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUM1Q0EsQ0FBQ0E7Z0JBQ05BLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9wQixnQ0FBaUJBLEdBQXpCQSxVQUEwQkEsYUFBYUEsRUFBRUEsTUFBTUE7UUFDM0NxQixJQUFJQSxZQUFZQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNyQkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBO1lBQ3pCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLGFBQWFBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3pEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxhQUFhQSxFQUFFQSxZQUFZQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoRkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNwQkEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsYUFBYUEsRUFBRUEsWUFBWUEsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDaEZBLENBQUNBO0lBQ0xBLENBQUNBO0lBR09yQiwwQkFBV0EsR0FBbkJBLFVBQW9CQSxhQUFhQSxFQUFFQSxHQUFXQSxFQUFFQSxZQUFZQSxFQUFFQSxRQUFRQTtRQUNsRXNCLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLElBQUlBLEtBQUtBLENBQUNBO1lBQy9CQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUU3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVEEsSUFBSUEsTUFBTUEsR0FBVUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUMvREEsSUFBSUE7WUFDQUEsSUFBSUEsTUFBTUEsR0FBVUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHcERBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUNkQSxzQ0FBc0NBLEVBQ3RDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxHQUFHQSxDQUNyQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FDN0RBLEVBQUVBLE1BQU1BLENBQ1pBLENBQUNBO1FBQ05BLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxJQUFJQSxNQUFNQSxHQUFhQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN6REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3hCQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLGFBQWFBLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1lBQ3pFQSxJQUFJQTtnQkFDQUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN0REEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO2dCQUNUQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFBQTtZQUUxQkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FDZEEsZ0RBQWdEQSxFQUNoREEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFDbkVBLFNBQVNBLENBQ1pBLENBQUNBO1FBQ05BLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBO1lBQ2RBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVPdEIsaUNBQWtCQSxHQUExQkEsVUFBMkJBLEdBQVdBLEVBQUVBLFFBQVFBO1FBQzVDdUIsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDM0JBLElBQUlBLFlBQVlBLEdBQXNDQSxFQUFFQSxDQUFDQTtRQUV6REEsbUJBQW1CQSxNQUF5Q0EsRUFBRUEsSUFBWUEsRUFBRUEsRUFBVUE7WUFDbEZDLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQTtnQkFDN0NBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNoQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBRU5BLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO29CQUNyQkEsTUFBTUEsQ0FBQ0E7WUFDZkEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUVwREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFFMUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO29CQUNkQSxJQUFJQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQTtvQkFDdEJBLEtBQUtBLEVBQUVBLEtBQUtBO2lCQUNmQSxDQUFDQSxDQUFDQTtnQkFFSEEsR0FBR0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQzFCQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNiQSxDQUFDQTtZQUVEQSxPQUFPQSxHQUFHQSxHQUFHQSxFQUFFQSxJQUFJQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtnQkFDckNBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO2dCQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTt3QkFDZEEsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUE7d0JBQ3RCQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQTtxQkFDdENBLENBQUNBLENBQUNBO2dCQUNQQSxDQUFDQTtnQkFBQ0EsSUFBSUE7b0JBQ0ZBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3BCQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNiQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVERCxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNwQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBU0EsV0FBV0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUEsRUFBRUEsUUFBUUE7WUFDakUsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLFlBQVksQ0FBQyxJQUFJLENBQUM7b0JBQ2QsSUFBSSxFQUFFLE1BQU07b0JBQ1osS0FBSyxFQUFFLFdBQVc7aUJBQ3JCLENBQUMsQ0FBQztZQUNQLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUM7b0JBQ1QsTUFBTSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBRXBDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7b0JBQ2QsU0FBUyxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDOUMsQ0FBQztRQUNMLENBQUMsRUFBRUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFcEVBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVPdkIsNkJBQWNBLEdBQXRCQTtRQU1JeUIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7SUFDekNBLENBQUNBO0lBRU16QixzQkFBT0EsR0FBZEE7UUFDSTBCLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUNoRUEsT0FBT0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDN0JBLENBQUNBO0lBQ0wxQixXQUFDQTtBQUFEQSxDQUFDQSxBQXBpQkQsRUFBMEIsR0FBRyxDQUFDLGlCQUFpQixFQW9pQjlDO0FBcGlCWSxZQUFJLE9Bb2lCaEIsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBvb3AgPSByZXF1aXJlKFwiLi4vbGliL29vcFwiKTtcbmltcG9ydCBkb20gPSByZXF1aXJlKFwiLi4vbGliL2RvbVwiKTtcbmltcG9ydCBsYW5nID0gcmVxdWlyZShcIi4uL2xpYi9sYW5nXCIpO1xuaW1wb3J0IHVzZXJhZ2VudCA9IHJlcXVpcmUoXCIuLi9saWIvdXNlcmFnZW50XCIpO1xuaW1wb3J0IGVzbSA9IHJlcXVpcmUoXCIuLi9lZGl0X3Nlc3Npb25cIik7XG5pbXBvcnQgZXZlID0gcmVxdWlyZShcIi4uL2xpYi9ldmVudF9lbWl0dGVyXCIpO1xuaW1wb3J0IGZtbSA9IHJlcXVpcmUoXCIuLi9sYXllci9mb250X21ldHJpY3NcIik7XG5cbmV4cG9ydCBjbGFzcyBUZXh0IGV4dGVuZHMgZXZlLkV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgZWxlbWVudCA9IDxIVE1MRGl2RWxlbWVudD5kb20uY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBwcml2YXRlICRwYWRkaW5nID0gMDtcbiAgICBwcml2YXRlIEVPRl9DSEFSID0gXCJcXHhCNlwiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfTEYgPSBcIlxceEFDXCI7XG4gICAgcHJpdmF0ZSBFT0xfQ0hBUl9DUkxGID0gXCJcXHhhNFwiO1xuICAgIHByaXZhdGUgRU9MX0NIQVI7XG4gICAgcHJpdmF0ZSBUQUJfQ0hBUiA9IFwiXFx1MjE5MlwiOyAvL1wiXFx1MjFFNVwiO1xuICAgIHByaXZhdGUgU1BBQ0VfQ0hBUiA9IFwiXFx4QjdcIjtcbiAgICBwcml2YXRlICRmb250TWV0cmljczogZm1tLkZvbnRNZXRyaWNzO1xuICAgIHByaXZhdGUgc2Vzc2lvbjogZXNtLkVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgJHBvbGxTaXplQ2hhbmdlc1RpbWVyO1xuICAgIHByaXZhdGUgc2hvd0ludmlzaWJsZXMgPSBmYWxzZTtcbiAgICBwcml2YXRlIGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHByaXZhdGUgJHRhYlN0cmluZ3MgPSBbXTtcbiAgICBwcml2YXRlICR0ZXh0VG9rZW4gPSB7IFwidGV4dFwiOiB0cnVlLCBcInJwYXJlblwiOiB0cnVlLCBcImxwYXJlblwiOiB0cnVlIH07XG4gICAgcHJpdmF0ZSB0YWJTaXplO1xuICAgIHByaXZhdGUgJGluZGVudEd1aWRlUmU7XG4gICAgcHVibGljIGNvbmZpZztcbiAgICBwcml2YXRlICRtZWFzdXJlTm9kZTtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnRFbDogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5lbGVtZW50LmNsYXNzTmFtZSA9IFwiYWNlX2xheWVyIGFjZV90ZXh0LWxheWVyXCI7XG4gICAgICAgIHBhcmVudEVsLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUVvbENoYXIgPSB0aGlzLiR1cGRhdGVFb2xDaGFyLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuRU9MX0NIQVIgPSB0aGlzLkVPTF9DSEFSX0xGO1xuICAgIH1cblxuICAgICR1cGRhdGVFb2xDaGFyKCkge1xuICAgICAgICB2YXIgRU9MX0NIQVIgPSB0aGlzLnNlc3Npb24uZG9jLmdldE5ld0xpbmVDaGFyYWN0ZXIoKSA9PSBcIlxcblwiXG4gICAgICAgICAgICA/IHRoaXMuRU9MX0NIQVJfTEZcbiAgICAgICAgICAgIDogdGhpcy5FT0xfQ0hBUl9DUkxGO1xuICAgICAgICBpZiAodGhpcy5FT0xfQ0hBUiAhPSBFT0xfQ0hBUikge1xuICAgICAgICAgICAgdGhpcy5FT0xfQ0hBUiA9IEVPTF9DSEFSO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgc2V0UGFkZGluZyhwYWRkaW5nOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy4kcGFkZGluZyA9IHBhZGRpbmc7XG4gICAgICAgIHRoaXMuZWxlbWVudC5zdHlsZS5wYWRkaW5nID0gXCIwIFwiICsgcGFkZGluZyArIFwicHhcIjtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0TGluZUhlaWdodCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGZvbnRNZXRyaWNzLiRjaGFyYWN0ZXJTaXplLmhlaWdodCB8fCAwO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRDaGFyYWN0ZXJXaWR0aCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGZvbnRNZXRyaWNzLiRjaGFyYWN0ZXJTaXplLndpZHRoIHx8IDA7XG4gICAgfVxuXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhtZWFzdXJlKSB7XG4gICAgICAgIHRoaXMuJGZvbnRNZXRyaWNzID0gbWVhc3VyZTtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3Mub24oXCJjaGFuZ2VDaGFyYWN0ZXJTaXplXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgZSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuJHBvbGxTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjaGVja0ZvclNpemVDaGFuZ2VzKCkge1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIgPSB0aGlzLiRmb250TWV0cmljcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFNlc3Npb24oc2Vzc2lvbjogZXNtLkVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzID09PSBzaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zaG93SW52aXNpYmxlcyA9IHNob3dJbnZpc2libGVzO1xuICAgICAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAgICAgICBpZiAodGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzID09PSBkaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMgPSBkaXNwbGF5SW5kZW50R3VpZGVzO1xuICAgICAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGSVhNRTogREdIIENoZWNrIHRoYXQgdGhpcyBpcyBjb25zaXN0ZW50IHdpdGggQUNFXG4gICAgcHVibGljIG9uQ2hhbmdlVGFiU2l6ZSgpIHtcbiAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpXG4gICAgfVxuXG4gICAgLy8gICAgdGhpcy5vbkNoYW5nZVRhYlNpemUgPVxuICAgIHByaXZhdGUgJGNvbXB1dGVUYWJTdHJpbmcoKSB7XG4gICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5zZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgdGhpcy50YWJTaXplID0gdGFiU2l6ZTtcbiAgICAgICAgdmFyIHRhYlN0ciA9IHRoaXMuJHRhYlN0cmluZ3MgPSBbXCIwXCJdO1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRhYlNpemUgKyAxOyBpKyspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICAgICAgdGFiU3RyLnB1c2goXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3RhYic+XCJcbiAgICAgICAgICAgICAgICAgICAgKyB0aGlzLlRBQl9DSEFSXG4gICAgICAgICAgICAgICAgICAgICsgbGFuZy5zdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCBpIC0gMSlcbiAgICAgICAgICAgICAgICAgICAgKyBcIjwvc3Bhbj5cIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKGxhbmcuc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGluZGVudEd1aWRlUmUgPSAvXFxzXFxTfCBcXHR8XFx0IHxcXHMkLztcbiAgICAgICAgICAgIHZhciBjbGFzc05hbWUgPSBcImFjZV9pbmRlbnQtZ3VpZGVcIjtcbiAgICAgICAgICAgIHZhciBzcGFjZUNsYXNzID0gXCJcIjtcbiAgICAgICAgICAgIHZhciB0YWJDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSArPSBcIiBhY2VfaW52aXNpYmxlXCI7XG4gICAgICAgICAgICAgICAgc3BhY2VDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfc3BhY2VcIjtcbiAgICAgICAgICAgICAgICB0YWJDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfdGFiXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlQ29udGVudCA9IGxhbmcuc3RyaW5nUmVwZWF0KHRoaXMuU1BBQ0VfQ0hBUiwgdGhpcy50YWJTaXplKTtcbiAgICAgICAgICAgICAgICB2YXIgdGFiQ29udGVudCA9IHRoaXMuVEFCX0NIQVIgKyBsYW5nLnN0cmluZ1JlcGVhdChcIlxceGEwXCIsIHRoaXMudGFiU2l6ZSAtIDEpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2VDb250ZW50ID0gbGFuZy5zdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCB0aGlzLnRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50ID0gc3BhY2VDb250ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiR0YWJTdHJpbmdzW1wiIFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgc3BhY2VDbGFzcyArIFwiJz5cIiArIHNwYWNlQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgdGFiQ2xhc3MgKyBcIic+XCIgKyB0YWJDb250ZW50ICsgXCI8L3NwYW4+XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlTGluZXMoY29uZmlnOiB7IGZpcnN0Um93OiBudW1iZXI7IGxhc3RSb3c6IG51bWJlcjsgbGluZUhlaWdodDogbnVtYmVyIH0sIGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBEdWUgdG8gd3JhcCBsaW5lIGNoYW5nZXMgdGhlcmUgY2FuIGJlIG5ldyBsaW5lcyBpZiBlLmcuXG4gICAgICAgIC8vIHRoZSBsaW5lIHRvIHVwZGF0ZWQgd3JhcHBlZCBpbiB0aGUgbWVhbnRpbWUuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5sYXN0Um93ICE9IGNvbmZpZy5sYXN0Um93IHx8XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5maXJzdFJvdyAhPSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGluZXMoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICB2YXIgZmlyc3QgPSBNYXRoLm1heChmaXJzdFJvdywgY29uZmlnLmZpcnN0Um93KTtcbiAgICAgICAgdmFyIGxhc3QgPSBNYXRoLm1pbihsYXN0Um93LCBjb25maWcubGFzdFJvdyk7XG5cbiAgICAgICAgdmFyIGxpbmVFbGVtZW50cyA9IHRoaXMuZWxlbWVudC5jaGlsZE5vZGVzO1xuICAgICAgICB2YXIgbGluZUVsZW1lbnRzSWR4ID0gMDtcblxuICAgICAgICBmb3IgKHZhciByb3cgPSBjb25maWcuZmlyc3RSb3c7IHJvdyA8IGZpcnN0OyByb3crKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuY29udGFpbnNSb3coZmlyc3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxpbmVFbGVtZW50c0lkeCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0O1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93ID4gbGFzdClcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgdmFyIGxpbmVFbGVtZW50OiBIVE1MRWxlbWVudCA9IDxIVE1MRWxlbWVudD5saW5lRWxlbWVudHNbbGluZUVsZW1lbnRzSWR4KytdO1xuICAgICAgICAgICAgaWYgKGxpbmVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGh0bWwgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKFxuICAgICAgICAgICAgICAgICAgICBodG1sLCByb3csICF0aGlzLiR1c2VMaW5lR3JvdXBzKCksIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByb3crKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzY3JvbGxMaW5lcyhjb25maWcpIHtcbiAgICAgICAgdmFyIG9sZENvbmZpZyA9IHRoaXMuY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICBpZiAoIW9sZENvbmZpZyB8fCBvbGRDb25maWcubGFzdFJvdyA8IGNvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIHZhciBlbCA9IHRoaXMuZWxlbWVudDtcbiAgICAgICAgaWYgKG9sZENvbmZpZy5maXJzdFJvdyA8IGNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKG9sZENvbmZpZy5maXJzdFJvdywgY29uZmlnLmZpcnN0Um93IC0gMSk7IHJvdyA+IDA7IHJvdy0tKSB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlQ2hpbGQoZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob2xkQ29uZmlnLmxhc3RSb3cgPiBjb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKGNvbmZpZy5sYXN0Um93ICsgMSwgb2xkQ29uZmlnLmxhc3RSb3cpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmxhc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93IDwgb2xkQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgY29uZmlnLmZpcnN0Um93LCBvbGRDb25maWcuZmlyc3RSb3cgLSAxKTtcbiAgICAgICAgICAgIGlmIChlbC5maXJzdENoaWxkKVxuICAgICAgICAgICAgICAgIGVsLmluc2VydEJlZm9yZShmcmFnbWVudCwgZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZnJhZ21lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5sYXN0Um93ID4gb2xkQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHZhciBmcmFnbWVudCA9IHRoaXMuJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBvbGRDb25maWcubGFzdFJvdyArIDEsIGNvbmZpZy5sYXN0Um93KTtcbiAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLmVsZW1lbnQub3duZXJEb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3RSb3cpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSA8SFRNTERpdkVsZW1lbnQ+ZG9tLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgICAgICAvLyBHZXQgdGhlIHRva2VucyBwZXIgbGluZSBhcyB0aGVyZSBtaWdodCBiZSBzb21lIGxpbmVzIGluIGJldHdlZW5cbiAgICAgICAgICAgIC8vIGJlZWluZyBmb2xkZWQuXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKGh0bWwsIHJvdywgZmFsc2UsIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlKTtcblxuICAgICAgICAgICAgLy8gZG9uJ3QgdXNlIHNldElubmVySHRtbCBzaW5jZSB3ZSBhcmUgd29ya2luZyB3aXRoIGFuIGVtcHR5IERJVlxuICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NOYW1lID0gJ2FjZV9saW5lX2dyb3VwJztcbiAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY29udGFpbmVyLmZpcnN0Q2hpbGQpXG4gICAgICAgICAgICAgICAgICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZyYWdtZW50O1xuICAgIH1cblxuICAgIHB1YmxpYyB1cGRhdGUoY29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgICAgIHZhciBodG1sID0gW107XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGNvbmZpZy5maXJzdFJvdywgbGFzdFJvdyA9IGNvbmZpZy5sYXN0Um93O1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldE5leHRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvdyA+IGxhc3RSb3cpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPGRpdiBjbGFzcz0nYWNlX2xpbmVfZ3JvdXAnIHN0eWxlPSdoZWlnaHQ6XCIsIGNvbmZpZy5saW5lSGVpZ2h0ICogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpLCBcInB4Jz5cIilcblxuICAgICAgICAgICAgdGhpcy4kcmVuZGVyTGluZShodG1sLCByb3csIGZhbHNlLCByb3cgPT0gZm9sZFN0YXJ0ID8gZm9sZExpbmUgOiBmYWxzZSk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpXG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKFwiPC9kaXY+XCIpOyAvLyBlbmQgdGhlIGxpbmUgZ3JvdXBcblxuICAgICAgICAgICAgcm93Kys7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbGVtZW50LmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlcGxhY2VSZWcgPSAvXFx0fCZ8PHwoICspfChbXFx4MDAtXFx4MWZcXHg4MC1cXHhhMFxcdTE2ODBcXHUxODBFXFx1MjAwMC1cXHUyMDBmXFx1MjAyOFxcdTIwMjlcXHUyMDJGXFx1MjA1RlxcdTMwMDBcXHVGRUZGXSl8W1xcdTExMDAtXFx1MTE1RlxcdTExQTMtXFx1MTFBN1xcdTExRkEtXFx1MTFGRlxcdTIzMjktXFx1MjMyQVxcdTJFODAtXFx1MkU5OVxcdTJFOUItXFx1MkVGM1xcdTJGMDAtXFx1MkZENVxcdTJGRjAtXFx1MkZGQlxcdTMwMDAtXFx1MzAzRVxcdTMwNDEtXFx1MzA5NlxcdTMwOTktXFx1MzBGRlxcdTMxMDUtXFx1MzEyRFxcdTMxMzEtXFx1MzE4RVxcdTMxOTAtXFx1MzFCQVxcdTMxQzAtXFx1MzFFM1xcdTMxRjAtXFx1MzIxRVxcdTMyMjAtXFx1MzI0N1xcdTMyNTAtXFx1MzJGRVxcdTMzMDAtXFx1NERCRlxcdTRFMDAtXFx1QTQ4Q1xcdUE0OTAtXFx1QTRDNlxcdUE5NjAtXFx1QTk3Q1xcdUFDMDAtXFx1RDdBM1xcdUQ3QjAtXFx1RDdDNlxcdUQ3Q0ItXFx1RDdGQlxcdUY5MDAtXFx1RkFGRlxcdUZFMTAtXFx1RkUxOVxcdUZFMzAtXFx1RkU1MlxcdUZFNTQtXFx1RkU2NlxcdUZFNjgtXFx1RkU2QlxcdUZGMDEtXFx1RkY2MFxcdUZGRTAtXFx1RkZFNl0vZztcbiAgICAgICAgdmFyIHJlcGxhY2VGdW5jID0gZnVuY3Rpb24oYywgYSwgYiwgdGFiSWR4LCBpZHg0KSB7XG4gICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLnNob3dJbnZpc2libGVzID9cbiAgICAgICAgICAgICAgICAgICAgXCI8c3BhbiBjbGFzcz0nYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlJz5cIiArIGxhbmcuc3RyaW5nUmVwZWF0KHNlbGYuU1BBQ0VfQ0hBUiwgYy5sZW5ndGgpICsgXCI8L3NwYW4+XCIgOlxuICAgICAgICAgICAgICAgICAgICBsYW5nLnN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIiZcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIiYjMzg7XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCI8XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCImIzYwO1wiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHNlbGYuc2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbiArIHRhYklkeCk7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IHRhYlNpemUgLSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLiR0YWJTdHJpbmdzW3RhYlNpemVdO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiXFx1MzAwMFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gVSszMDAwIGlzIGJvdGggaW52aXNpYmxlIEFORCBmdWxsLXdpZHRoLCBzbyBtdXN0IGJlIGhhbmRsZWQgdW5pcXVlbHlcbiAgICAgICAgICAgICAgICB2YXIgY2xhc3NUb1VzZSA9IHNlbGYuc2hvd0ludmlzaWJsZXMgPyBcImFjZV9jamsgYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlXCIgOiBcImFjZV9jamtcIjtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2UgPSBzZWxmLnNob3dJbnZpc2libGVzID8gc2VsZi5TUEFDRV9DSEFSIDogXCJcIjtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nXCIgKyBjbGFzc1RvVXNlICsgXCInIHN0eWxlPSd3aWR0aDpcIiArXG4gICAgICAgICAgICAgICAgICAgIChzZWxmLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCAqIDIpICtcbiAgICAgICAgICAgICAgICAgICAgXCJweCc+XCIgKyBzcGFjZSArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZSBhY2VfaW52YWxpZCc+XCIgKyBzZWxmLlNQQUNFX0NIQVIgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J2FjZV9jamsnIHN0eWxlPSd3aWR0aDpcIiArXG4gICAgICAgICAgICAgICAgICAgIChzZWxmLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCAqIDIpICtcbiAgICAgICAgICAgICAgICAgICAgXCJweCc+XCIgKyBjICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb3V0cHV0ID0gdmFsdWUucmVwbGFjZShyZXBsYWNlUmVnLCByZXBsYWNlRnVuYyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiR0ZXh0VG9rZW5bdG9rZW4udHlwZV0pIHtcbiAgICAgICAgICAgIHZhciBjbGFzc2VzID0gXCJhY2VfXCIgKyB0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi9nLCBcIiBhY2VfXCIpO1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gXCJcIjtcbiAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09IFwiZm9sZFwiKVxuICAgICAgICAgICAgICAgIHN0eWxlID0gXCIgc3R5bGU9J3dpZHRoOlwiICsgKHRva2VuLnZhbHVlLmxlbmd0aCAqIHRoaXMuY29uZmlnLmNoYXJhY3RlcldpZHRoKSArIFwicHg7JyBcIjtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjxzcGFuIGNsYXNzPSdcIiwgY2xhc3NlcywgXCInXCIsIHN0eWxlLCBcIj5cIiwgb3V0cHV0LCBcIjwvc3Bhbj5cIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2gob3V0cHV0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2NyZWVuQ29sdW1uICsgdmFsdWUubGVuZ3RoO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUsIG1heD8pIHtcbiAgICAgICAgdmFyIGNvbHMgPSB2YWx1ZS5zZWFyY2godGhpcy4kaW5kZW50R3VpZGVSZSk7XG4gICAgICAgIGlmIChjb2xzIDw9IDAgfHwgY29scyA+PSBtYXgpXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIGlmICh2YWx1ZVswXSA9PSBcIiBcIikge1xuICAgICAgICAgICAgY29scyAtPSBjb2xzICUgdGhpcy50YWJTaXplO1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKGxhbmcuc3RyaW5nUmVwZWF0KHRoaXMuJHRhYlN0cmluZ3NbXCIgXCJdLCBjb2xzIC8gdGhpcy50YWJTaXplKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlWzBdID09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChsYW5nLnN0cmluZ1JlcGVhdCh0aGlzLiR0YWJTdHJpbmdzW1wiXFx0XCJdLCBjb2xzKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJXcmFwcGVkTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnM6IHsgdmFsdWU6IHN0cmluZyB9W10sIHNwbGl0czogbnVtYmVyW10sIG9ubHlDb250ZW50cykge1xuICAgICAgICB2YXIgY2hhcnMgPSAwO1xuICAgICAgICB2YXIgc3BsaXQgPSAwO1xuICAgICAgICB2YXIgc3BsaXRDaGFycyA9IHNwbGl0c1swXTtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGkgPT0gMCAmJiB0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgICAgICBjaGFycyA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUsIHNwbGl0Q2hhcnMpO1xuICAgICAgICAgICAgICAgIGlmICghdmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNoYXJzIC09IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoYXJzICsgdmFsdWUubGVuZ3RoIDwgc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChjaGFycyArIHZhbHVlLmxlbmd0aCA+PSBzcGxpdENoYXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4sIHZhbHVlLnN1YnN0cmluZygwLCBzcGxpdENoYXJzIC0gY2hhcnMpXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKHNwbGl0Q2hhcnMgLSBjaGFycyk7XG4gICAgICAgICAgICAgICAgICAgIGNoYXJzID0gc3BsaXRDaGFycztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0LCBcInB4Jz5cIlxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Kys7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0Q2hhcnMgPSBzcGxpdHNbc3BsaXRdIHx8IE51bWJlci5NQVhfVkFMVUU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjaGFycyArPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RyaW5nQnVpbGRlciwgc2NyZWVuQ29sdW1uLCB0b2tlbiwgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRyZW5kZXJTaW1wbGVMaW5lKHN0cmluZ0J1aWxkZXIsIHRva2Vucykge1xuICAgICAgICB2YXIgc2NyZWVuQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIHRva2VuID0gdG9rZW5zWzBdO1xuICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuZGlzcGxheUluZGVudEd1aWRlcylcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5yZW5kZXJJbmRlbnRHdWlkZShzdHJpbmdCdWlsZGVyLCB2YWx1ZSk7XG4gICAgICAgIGlmICh2YWx1ZSlcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHNjcmVlbkNvbHVtbiA9IHRoaXMuJHJlbmRlclRva2VuKHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHJvdyBpcyBlaXRoZXIgZmlyc3Qgcm93IG9mIGZvbGRsaW5lIG9yIG5vdCBpbiBmb2xkXG4gICAgcHJpdmF0ZSAkcmVuZGVyTGluZShzdHJpbmdCdWlsZGVyLCByb3c6IG51bWJlciwgb25seUNvbnRlbnRzLCBmb2xkTGluZSkge1xuICAgICAgICBpZiAoIWZvbGRMaW5lICYmIGZvbGRMaW5lICE9IGZhbHNlKVxuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0Rm9sZExpbmUocm93KTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBhbnlbXSA9IHRoaXMuJGdldEZvbGRMaW5lVG9rZW5zKHJvdywgZm9sZExpbmUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBhbnlbXSA9IHRoaXMuc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuXG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goXG4gICAgICAgICAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY2VfbGluZScgc3R5bGU9J2hlaWdodDpcIixcbiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5saW5lSGVpZ2h0ICogKFxuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1c2VMaW5lR3JvdXBzKCkgPyAxIDogdGhpcy5zZXNzaW9uLmdldFJvd0xlbmd0aChyb3cpXG4gICAgICAgICAgICAgICAgKSwgXCJweCc+XCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSB0aGlzLnNlc3Npb24uZ2V0Um93U3BsaXREYXRhKHJvdyk7XG4gICAgICAgICAgICBpZiAoc3BsaXRzICYmIHNwbGl0cy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zLCBzcGxpdHMsIG9ubHlDb250ZW50cyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93XG5cbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcbiAgICAgICAgICAgICAgICBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfZW9sJz5cIixcbiAgICAgICAgICAgICAgICByb3cgPT0gdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpIC0gMSA/IHRoaXMuRU9GX0NIQVIgOiB0aGlzLkVPTF9DSEFSLFxuICAgICAgICAgICAgICAgIFwiPC9zcGFuPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKVxuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldEZvbGRMaW5lVG9rZW5zKHJvdzogbnVtYmVyLCBmb2xkTGluZSk6IHt9W10ge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJlbmRlclRva2VuczogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkVG9rZW5zKHRva2VuczogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBpZHggPSAwLCBjb2wgPSAwO1xuICAgICAgICAgICAgd2hpbGUgKChjb2wgKyB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGgpIDwgZnJvbSkge1xuICAgICAgICAgICAgICAgIGNvbCArPSB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09IHRva2Vucy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb2wgIT0gZnJvbSkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlLnN1YnN0cmluZyhmcm9tIC0gY29sKTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdG9rZW4gdmFsdWUgaXMgbG9uZ2VyIHRoZW4gdGhlIGZyb20uLi50byBzcGFjaW5nLlxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAodG8gLSBmcm9tKSlcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgdG8gLSBmcm9tKTtcblxuICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW5zW2lkeF0udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjb2wgPSBmcm9tICsgdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAoY29sIDwgdG8gJiYgaWR4IDwgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggKyBjb2wgPiB0bykge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbnNbaWR4XS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLnN1YnN0cmluZygwLCB0byAtIGNvbClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHRva2Vuc1tpZHhdKTtcbiAgICAgICAgICAgICAgICBjb2wgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VucyA9IHNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uLCBpc05ld1Jvdykge1xuICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChpc05ld1JvdylcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICBhZGRUb2tlbnModG9rZW5zLCBsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmb2xkTGluZS5lbmQucm93LCB0aGlzLnNlc3Npb24uZ2V0TGluZShmb2xkTGluZS5lbmQucm93KS5sZW5ndGgpO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJUb2tlbnM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXNlTGluZUdyb3VwcygpIHtcbiAgICAgICAgLy8gRm9yIHRoZSB1cGRhdGVMaW5lcyBmdW5jdGlvbiB0byB3b3JrIGNvcnJlY3RseSwgaXQncyBpbXBvcnRhbnQgdGhhdCB0aGVcbiAgICAgICAgLy8gY2hpbGQgbm9kZXMgb2YgdGhpcy5lbGVtZW50IGNvcnJlc3BvbmQgb24gYSAxLXRvLTEgYmFzaXMgdG8gcm93cyBpbiB0aGVcbiAgICAgICAgLy8gZG9jdW1lbnQgKGFzIGRpc3RpbmN0IGZyb20gbGluZXMgb24gdGhlIHNjcmVlbikuIEZvciBzZXNzaW9ucyB0aGF0IGFyZVxuICAgICAgICAvLyB3cmFwcGVkLCB0aGlzIG1lYW5zIHdlIG5lZWQgdG8gYWRkIGEgbGF5ZXIgdG8gdGhlIG5vZGUgaGllcmFyY2h5ICh0YWdnZWRcbiAgICAgICAgLy8gd2l0aCB0aGUgY2xhc3MgbmFtZSBhY2VfbGluZV9ncm91cCkuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZGVzdHJveSgpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLiRwb2xsU2l6ZUNoYW5nZXNUaW1lcik7XG4gICAgICAgIGlmICh0aGlzLiRtZWFzdXJlTm9kZSlcbiAgICAgICAgICAgIHRoaXMuJG1lYXN1cmVOb2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy4kbWVhc3VyZU5vZGUpO1xuICAgICAgICBkZWxldGUgdGhpcy4kbWVhc3VyZU5vZGU7XG4gICAgfVxufVxuIl19