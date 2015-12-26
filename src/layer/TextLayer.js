"use strict";
import { createElement } from "../lib/dom";
import { stringRepeat } from "../lib/lang";
import AbstractLayer from './AbstractLayer';
import EventEmitterClass from "../lib/EventEmitterClass";
export default class TextLayer extends AbstractLayer {
    constructor(parent) {
        super(parent, "ace_layer ace_text-layer");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dExheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiVGV4dExheWVyLnRzIl0sIm5hbWVzIjpbIlRleHRMYXllciIsIlRleHRMYXllci5jb25zdHJ1Y3RvciIsIlRleHRMYXllci51cGRhdGVFb2xDaGFyIiwiVGV4dExheWVyLnNldFBhZGRpbmciLCJUZXh0TGF5ZXIuZ2V0TGluZUhlaWdodCIsIlRleHRMYXllci5nZXRDaGFyYWN0ZXJXaWR0aCIsIlRleHRMYXllci4kc2V0Rm9udE1ldHJpY3MiLCJUZXh0TGF5ZXIuY2hlY2tGb3JTaXplQ2hhbmdlcyIsIlRleHRMYXllci4kcG9sbFNpemVDaGFuZ2VzIiwiVGV4dExheWVyLnNldFNlc3Npb24iLCJUZXh0TGF5ZXIuc2V0U2hvd0ludmlzaWJsZXMiLCJUZXh0TGF5ZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyIsIlRleHRMYXllci5vbiIsIlRleHRMYXllci5vZmYiLCJUZXh0TGF5ZXIub25DaGFuZ2VUYWJTaXplIiwiVGV4dExheWVyLiRjb21wdXRlVGFiU3RyaW5nIiwiVGV4dExheWVyLnVwZGF0ZUxpbmVzIiwiVGV4dExheWVyLnNjcm9sbExpbmVzIiwiVGV4dExheWVyLiRyZW5kZXJMaW5lc0ZyYWdtZW50IiwiVGV4dExheWVyLnVwZGF0ZSIsIlRleHRMYXllci4kcmVuZGVyVG9rZW4iLCJUZXh0TGF5ZXIucmVuZGVySW5kZW50R3VpZGUiLCJUZXh0TGF5ZXIuJHJlbmRlcldyYXBwZWRMaW5lIiwiVGV4dExheWVyLiRyZW5kZXJTaW1wbGVMaW5lIiwiVGV4dExheWVyLiRyZW5kZXJMaW5lIiwiVGV4dExheWVyLiRnZXRGb2xkTGluZVRva2VucyIsIlRleHRMYXllci4kZ2V0Rm9sZExpbmVUb2tlbnMuYWRkVG9rZW5zIiwiVGV4dExheWVyLiR1c2VMaW5lR3JvdXBzIiwiVGV4dExheWVyLmRlc3Ryb3kiXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLGFBQWEsRUFB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QSxDQUFDQTtnQkFDdkRBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDWEEsS0FBS0EsQ0FBQ0E7WUFFVkEsSUFBSUEsV0FBV0EsR0FBNkJBLFlBQVlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBLENBQUNBO1lBQzVFQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZEEsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBQ2RBLElBQUlBLENBQUNBLFdBQVdBLENBQ1pBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLEVBQUVBLEdBQUdBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLEtBQUtBLENBQ3pFQSxDQUFDQTtnQkFDRkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ3JGQSxXQUFXQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMxQ0EsQ0FBQ0E7WUFDREEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDVkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFTWhCLFdBQVdBLENBQUNBLE1BQU1BO1FBQ3JCaUIsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXJCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxTQUFTQSxDQUFDQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNsREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBO1lBQ3BDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUvQkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBRXZDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN4R0EsRUFBRUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDbENBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBRXJDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLEVBQUVBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLEVB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LFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMzQkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZEQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN6REEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLENBQUNBO1lBRVZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO2dCQUN0QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNENBQTRDQSxFQUFFQSxNQUFNQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFBQTtZQUV2SEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsR0FBR0EsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFFeEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO2dCQUN0QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7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LENBQUNBO2dCQUVOQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtvQkFDckJBLE1BQU1BLENBQUNBO1lBQ2ZBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFFcERBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO29CQUMzQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBRTFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQTtvQkFDZEEsSUFBSUEsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUE7b0JBQ3RCQSxLQUFLQSxFQUFFQSxLQUFLQTtpQkFDZkEsQ0FBQ0EsQ0FBQ0E7Z0JBRUhBLEdBQUdBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUMxQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFFREEsT0FBT0EsR0FBR0EsR0FBR0EsRUFBRUEsSUFBSUEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ3JDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUMxQkEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7d0JBQ2RBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBO3dCQUN0QkEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0E7cUJBQ3RDQSxDQUFDQSxDQUFDQTtnQkFDUEEsQ0FBQ0E7Z0JBQUNBLElBQUlBO29CQUNGQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNwQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDYkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREQsSUFBSUEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDcENBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFVBQVNBLFdBQVdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLFVBQVVBLEVBQUVBLFFBQVFBO1lBQ2pFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixZQUFZLENBQUMsSUFBSSxDQUFDO29CQUNkLElBQUksRUFBRSxNQUFNO29CQUNaLEtBQUssRUFBRSxXQUFXO2lCQUNyQixDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUM7Z0JBQ0YsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDO29CQUNULE1BQU0sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUVwQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO29CQUNkLFNBQVMsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLENBQUM7UUFDTCxDQUFDLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXBFQSxNQUFNQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUN4QkEsQ0FBQ0E7SUFFT3pCLGNBQWNBO1FBTWxCMkIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7SUFDekNBLENBQUNBO0lBTU0zQixPQUFPQTtRQUNWNEIsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxDQUFDQTtRQUMxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ2hFQSxDQUFDQTtRQUNEQSxPQUFPQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7QUFDTDVCLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IHtjcmVhdGVFbGVtZW50fSBmcm9tIFwiLi4vbGliL2RvbVwiO1xuaW1wb3J0IHtzdHJpbmdSZXBlYXR9IGZyb20gXCIuLi9saWIvbGFuZ1wiO1xuaW1wb3J0IEFic3RyYWN0TGF5ZXIgZnJvbSAnLi9BYnN0cmFjdExheWVyJztcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBFdmVudEJ1cyBmcm9tIFwiLi9FdmVudEJ1c1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuLi9saWIvRXZlbnRFbWl0dGVyQ2xhc3NcIjtcbmltcG9ydCBGb2xkTGluZSBmcm9tIFwiLi4vRm9sZExpbmVcIjtcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBUb2tlbiBmcm9tIFwiLi4vVG9rZW5cIjtcblxuLyoqXG4gKiBAY2xhc3MgVGV4dExheWVyXG4gKiBAZXh0ZW5kcyBBYnN0cmFjdExheWVyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRleHRMYXllciBleHRlbmRzIEFic3RyYWN0TGF5ZXIgaW1wbGVtZW50cyBFdmVudEJ1czxUZXh0TGF5ZXI+IHtcbiAgICBwcml2YXRlICRwYWRkaW5nID0gMDtcbiAgICBwcml2YXRlIEVPRl9DSEFSID0gXCJcXHhCNlwiO1xuICAgIHByaXZhdGUgRU9MX0NIQVJfTEYgPSBcIlxceEFDXCI7XG4gICAgcHJpdmF0ZSBFT0xfQ0hBUl9DUkxGID0gXCJcXHhhNFwiO1xuICAgIHByaXZhdGUgRU9MX0NIQVI6IHN0cmluZztcbiAgICBwcml2YXRlIFRBQl9DSEFSID0gXCJcXHUyMTkyXCI7IC8vXCJcXHUyMUU1XCI7XG4gICAgcHJpdmF0ZSBTUEFDRV9DSEFSID0gXCJcXHhCN1wiO1xuICAgIHByaXZhdGUgJGZvbnRNZXRyaWNzOiBGb250TWV0cmljcztcbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuICAgIHByaXZhdGUgJHBvbGxTaXplQ2hhbmdlc1RpbWVyOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzaG93SW52aXNpYmxlcyA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbiA9IHRydWU7XG4gICAgcHJpdmF0ZSAkdGFiU3RyaW5nczogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlICR0ZXh0VG9rZW4gPSB7IFwidGV4dFwiOiB0cnVlLCBcInJwYXJlblwiOiB0cnVlLCBcImxwYXJlblwiOiB0cnVlIH07XG4gICAgcHJpdmF0ZSB0YWJTaXplOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkaW5kZW50R3VpZGVSZTogUmVnRXhwO1xuICAgIHB1YmxpYyBjb25maWc7XG4gICAgcHJpdmF0ZSAkbWVhc3VyZU5vZGU6IE5vZGU7XG4gICAgcHJpdmF0ZSBldmVudEJ1czogRXZlbnRFbWl0dGVyQ2xhc3M8VGV4dExheWVyPjtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBUZXh0TGF5ZXJcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gcGFyZW50IHtIVE1MRWxlbWVudH1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCwgXCJhY2VfbGF5ZXIgYWNlX3RleHQtbGF5ZXJcIik7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8VGV4dExheWVyPih0aGlzKTtcbiAgICAgICAgdGhpcy5FT0xfQ0hBUiA9IHRoaXMuRU9MX0NIQVJfTEY7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB1cGRhdGVFb2xDaGFyXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICB1cGRhdGVFb2xDaGFyKCk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgRU9MX0NIQVIgPSB0aGlzLnNlc3Npb24uZG9jLmdldE5ld0xpbmVDaGFyYWN0ZXIoKSA9PT0gXCJcXG5cIlxuICAgICAgICAgICAgPyB0aGlzLkVPTF9DSEFSX0xGXG4gICAgICAgICAgICA6IHRoaXMuRU9MX0NIQVJfQ1JMRjtcbiAgICAgICAgaWYgKHRoaXMuRU9MX0NIQVIgIT0gRU9MX0NIQVIpIHtcbiAgICAgICAgICAgIHRoaXMuRU9MX0NIQVIgPSBFT0xfQ0hBUjtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHNldFBhZGRpbmcocGFkZGluZzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuJHBhZGRpbmcgPSBwYWRkaW5nO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUucGFkZGluZyA9IFwiMCBcIiArIHBhZGRpbmcgKyBcInB4XCI7XG4gICAgfVxuXG4gICAgcHVibGljIGdldExpbmVIZWlnaHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS5oZWlnaHQgfHwgMDtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Q2hhcmFjdGVyV2lkdGgoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRmb250TWV0cmljcy4kY2hhcmFjdGVyU2l6ZS53aWR0aCB8fCAwO1xuICAgIH1cblxuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MobWVhc3VyZTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgdGhpcy4kZm9udE1ldHJpY3MgPSBtZWFzdXJlO1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5vbihcImNoYW5nZUNoYXJhY3RlclNpemVcIiwgKGUpID0+IHtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUNoYXJhY3RlclNpemVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQ2hhcmFjdGVyU2l6ZVwiLCBlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuJHBvbGxTaXplQ2hhbmdlcygpO1xuICAgIH1cblxuICAgIHB1YmxpYyBjaGVja0ZvclNpemVDaGFuZ2VzKCkge1xuICAgICAgICB0aGlzLiRmb250TWV0cmljcy5jaGVja0ZvclNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcG9sbFNpemVDaGFuZ2VzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kcG9sbFNpemVDaGFuZ2VzVGltZXIgPSB0aGlzLiRmb250TWV0cmljcy4kcG9sbFNpemVDaGFuZ2VzKCk7XG4gICAgfVxuXG4gICAgcHVibGljIHNldFNlc3Npb24oc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgdGhpcy4kY29tcHV0ZVRhYlN0cmluZygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMgPT09IHNob3dJbnZpc2libGVzKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNob3dJbnZpc2libGVzID0gc2hvd0ludmlzaWJsZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMgPT09IGRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheUluZGVudEd1aWRlcyA9IGRpc3BsYXlJbmRlbnRHdWlkZXM7XG4gICAgICAgICAgICB0aGlzLiRjb21wdXRlVGFiU3RyaW5nKCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNvdXJjZTogVGV4dExheWVyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChldmVudDogYW55LCBzb3VyY2U6IFRleHRMYXllcikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzb3VyY2U6IFRleHRMYXllcikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNvdXJjZTogVGV4dExheWVyKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vZmYoZXZlbnROYW1lLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLy8gRklYTUU6IERHSCBDaGVjayB0aGF0IHRoaXMgaXMgY29uc2lzdGVudCB3aXRoIEFDRVxuICAgIHB1YmxpYyBvbkNoYW5nZVRhYlNpemUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVUYWJTdHJpbmcoKVxuICAgIH1cblxuICAgIC8vICAgIHRoaXMub25DaGFuZ2VUYWJTaXplID1cbiAgICBwcml2YXRlICRjb21wdXRlVGFiU3RyaW5nKCk6IHZvaWQge1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHRoaXMudGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICAgIHZhciB0YWJTdHIgPSB0aGlzLiR0YWJTdHJpbmdzID0gW1wiMFwiXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB0YWJTaXplICsgMTsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIHRhYlN0ci5wdXNoKFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV90YWInPlwiXG4gICAgICAgICAgICAgICAgICAgICsgdGhpcy5UQUJfQ0hBUlxuICAgICAgICAgICAgICAgICAgICArIHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGkgLSAxKVxuICAgICAgICAgICAgICAgICAgICArIFwiPC9zcGFuPlwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGFiU3RyLnB1c2goc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpIHtcbiAgICAgICAgICAgIHRoaXMuJGluZGVudEd1aWRlUmUgPSAvXFxzXFxTfCBcXHR8XFx0IHxcXHMkLztcbiAgICAgICAgICAgIHZhciBjbGFzc05hbWUgPSBcImFjZV9pbmRlbnQtZ3VpZGVcIjtcbiAgICAgICAgICAgIHZhciBzcGFjZUNsYXNzID0gXCJcIjtcbiAgICAgICAgICAgIHZhciB0YWJDbGFzcyA9IFwiXCI7XG4gICAgICAgICAgICBpZiAodGhpcy5zaG93SW52aXNpYmxlcykge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSArPSBcIiBhY2VfaW52aXNpYmxlXCI7XG4gICAgICAgICAgICAgICAgc3BhY2VDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfc3BhY2VcIjtcbiAgICAgICAgICAgICAgICB0YWJDbGFzcyA9IFwiIGFjZV9pbnZpc2libGVfdGFiXCI7XG4gICAgICAgICAgICAgICAgdmFyIHNwYWNlQ29udGVudCA9IHN0cmluZ1JlcGVhdCh0aGlzLlNQQUNFX0NIQVIsIHRoaXMudGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHRhYkNvbnRlbnQgPSB0aGlzLlRBQl9DSEFSICsgc3RyaW5nUmVwZWF0KFwiXFx4YTBcIiwgdGhpcy50YWJTaXplIC0gMSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzcGFjZUNvbnRlbnQgPSBzdHJpbmdSZXBlYXQoXCJcXHhhMFwiLCB0aGlzLnRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHZhciB0YWJDb250ZW50ID0gc3BhY2VDb250ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiR0YWJTdHJpbmdzW1wiIFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgc3BhY2VDbGFzcyArIFwiJz5cIiArIHNwYWNlQ29udGVudCArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgdGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSA9IFwiPHNwYW4gY2xhc3M9J1wiICsgY2xhc3NOYW1lICsgdGFiQ2xhc3MgKyBcIic+XCIgKyB0YWJDb250ZW50ICsgXCI8L3NwYW4+XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlTGluZXMoY29uZmlnOiB7IGZpcnN0Um93OiBudW1iZXI7IGxhc3RSb3c6IG51bWJlcjsgbGluZUhlaWdodDogbnVtYmVyIH0sIGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBEdWUgdG8gd3JhcCBsaW5lIGNoYW5nZXMgdGhlcmUgY2FuIGJlIG5ldyBsaW5lcyBpZiBlLmcuXG4gICAgICAgIC8vIHRoZSBsaW5lIHRvIHVwZGF0ZWQgd3JhcHBlZCBpbiB0aGUgbWVhbnRpbWUuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5sYXN0Um93ICE9IGNvbmZpZy5sYXN0Um93IHx8XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5maXJzdFJvdyAhPSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsTGluZXMoY29uZmlnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICB2YXIgZmlyc3QgPSBNYXRoLm1heChmaXJzdFJvdywgY29uZmlnLmZpcnN0Um93KTtcbiAgICAgICAgdmFyIGxhc3QgPSBNYXRoLm1pbihsYXN0Um93LCBjb25maWcubGFzdFJvdyk7XG5cbiAgICAgICAgdmFyIGxpbmVFbGVtZW50cyA9IHRoaXMuZWxlbWVudC5jaGlsZE5vZGVzO1xuICAgICAgICB2YXIgbGluZUVsZW1lbnRzSWR4ID0gMDtcblxuICAgICAgICBmb3IgKHZhciByb3cgPSBjb25maWcuZmlyc3RSb3c7IHJvdyA8IGZpcnN0OyByb3crKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuY29udGFpbnNSb3coZmlyc3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxpbmVFbGVtZW50c0lkeCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0O1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93ID4gbGFzdClcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgdmFyIGxpbmVFbGVtZW50OiBIVE1MRWxlbWVudCA9IDxIVE1MRWxlbWVudD5saW5lRWxlbWVudHNbbGluZUVsZW1lbnRzSWR4KytdO1xuICAgICAgICAgICAgaWYgKGxpbmVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGh0bWwgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKFxuICAgICAgICAgICAgICAgICAgICBodG1sLCByb3csICF0aGlzLiR1c2VMaW5lR3JvdXBzKCksIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcbiAgICAgICAgICAgICAgICBsaW5lRWxlbWVudC5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByb3crKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBzY3JvbGxMaW5lcyhjb25maWcpIHtcbiAgICAgICAgdmFyIG9sZENvbmZpZyA9IHRoaXMuY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICBpZiAoIW9sZENvbmZpZyB8fCBvbGRDb25maWcubGFzdFJvdyA8IGNvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIGlmIChjb25maWcubGFzdFJvdyA8IG9sZENvbmZpZy5maXJzdFJvdylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZShjb25maWcpO1xuXG4gICAgICAgIHZhciBlbCA9IHRoaXMuZWxlbWVudDtcbiAgICAgICAgaWYgKG9sZENvbmZpZy5maXJzdFJvdyA8IGNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKG9sZENvbmZpZy5maXJzdFJvdywgY29uZmlnLmZpcnN0Um93IC0gMSk7IHJvdyA+IDA7IHJvdy0tKSB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlQ2hpbGQoZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob2xkQ29uZmlnLmxhc3RSb3cgPiBjb25maWcubGFzdFJvdykge1xuICAgICAgICAgICAgLy8gRklYTUU6IERHSCBnZXRGb2xkZWRSb3dDb3VudCBkb2VzIG5vdCBleGlzdCBvbiBFZGl0U2Vzc2lvblxuICAgICAgICAgICAgZm9yICh2YXIgcm93ID0gdGhpcy5zZXNzaW9uWydnZXRGb2xkZWRSb3dDb3VudCddKGNvbmZpZy5sYXN0Um93ICsgMSwgb2xkQ29uZmlnLmxhc3RSb3cpOyByb3cgPiAwOyByb3ctLSkge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUNoaWxkKGVsLmxhc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY29uZmlnLmZpcnN0Um93IDwgb2xkQ29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICB2YXIgZnJhZ21lbnQgPSB0aGlzLiRyZW5kZXJMaW5lc0ZyYWdtZW50KGNvbmZpZywgY29uZmlnLmZpcnN0Um93LCBvbGRDb25maWcuZmlyc3RSb3cgLSAxKTtcbiAgICAgICAgICAgIGlmIChlbC5maXJzdENoaWxkKVxuICAgICAgICAgICAgICAgIGVsLmluc2VydEJlZm9yZShmcmFnbWVudCwgZWwuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgZWwuYXBwZW5kQ2hpbGQoZnJhZ21lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5sYXN0Um93ID4gb2xkQ29uZmlnLmxhc3RSb3cpIHtcbiAgICAgICAgICAgIHZhciBmcmFnbWVudCA9IHRoaXMuJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBvbGRDb25maWcubGFzdFJvdyArIDEsIGNvbmZpZy5sYXN0Um93KTtcbiAgICAgICAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHJlbmRlckxpbmVzRnJhZ21lbnQoY29uZmlnLCBmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGZyYWdtZW50ID0gdGhpcy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB2YXIgY29udGFpbmVyID0gPEhUTUxEaXZFbGVtZW50PmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAgICAgICAgIHZhciBodG1sOiAobnVtYmVyIHwgc3RyaW5nKVtdID0gW107XG4gICAgICAgICAgICAvLyBHZXQgdGhlIHRva2VucyBwZXIgbGluZSBhcyB0aGVyZSBtaWdodCBiZSBzb21lIGxpbmVzIGluIGJldHdlZW5cbiAgICAgICAgICAgIC8vIGJlZWluZyBmb2xkZWQuXG4gICAgICAgICAgICB0aGlzLiRyZW5kZXJMaW5lKGh0bWwsIHJvdywgZmFsc2UsIHJvdyA9PSBmb2xkU3RhcnQgPyBmb2xkTGluZSA6IGZhbHNlKTtcblxuICAgICAgICAgICAgLy8gZG9uJ3QgdXNlIHNldElubmVySHRtbCBzaW5jZSB3ZSBhcmUgd29ya2luZyB3aXRoIGFuIGVtcHR5IERJVlxuICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGh0bWwuam9pbihcIlwiKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VMaW5lR3JvdXBzKCkpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuY2xhc3NOYW1lID0gJ2FjZV9saW5lX2dyb3VwJztcbiAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSArIFwicHhcIjtcblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGNvbnRhaW5lci5maXJzdENoaWxkKVxuICAgICAgICAgICAgICAgICAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJvdysrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmcmFnbWVudDtcbiAgICB9XG5cbiAgICBwdWJsaWMgdXBkYXRlKGNvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcblxuICAgICAgICB2YXIgaHRtbCA9IFtdO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBjb25maWcuZmlyc3RSb3csIGxhc3RSb3cgPSBjb25maWcubGFzdFJvdztcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuc2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyb3cgPiBsYXN0Um93KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlTGluZUdyb3VwcygpKVxuICAgICAgICAgICAgICAgIGh0bWwucHVzaChcIjxkaXYgY2xhc3M9J2FjZV9saW5lX2dyb3VwJyBzdHlsZT0naGVpZ2h0OlwiLCBjb25maWcubGluZUhlaWdodCAqIHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KSwgXCJweCc+XCIpXG5cbiAgICAgICAgICAgIHRoaXMuJHJlbmRlckxpbmUoaHRtbCwgcm93LCBmYWxzZSwgcm93ID09IGZvbGRTdGFydCA/IGZvbGRMaW5lIDogZmFsc2UpO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlTGluZUdyb3VwcygpKVxuICAgICAgICAgICAgICAgIGh0bWwucHVzaChcIjwvZGl2PlwiKTsgLy8gZW5kIHRoZSBsaW5lIGdyb3VwXG5cbiAgICAgICAgICAgIHJvdysrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWxlbWVudC5pbm5lckhUTUwgPSBodG1sLmpvaW4oXCJcIik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXBsYWNlUmVnID0gL1xcdHwmfDx8KCArKXwoW1xceDAwLVxceDFmXFx4ODAtXFx4YTBcXHUxNjgwXFx1MTgwRVxcdTIwMDAtXFx1MjAwZlxcdTIwMjhcXHUyMDI5XFx1MjAyRlxcdTIwNUZcXHUzMDAwXFx1RkVGRl0pfFtcXHUxMTAwLVxcdTExNUZcXHUxMUEzLVxcdTExQTdcXHUxMUZBLVxcdTExRkZcXHUyMzI5LVxcdTIzMkFcXHUyRTgwLVxcdTJFOTlcXHUyRTlCLVxcdTJFRjNcXHUyRjAwLVxcdTJGRDVcXHUyRkYwLVxcdTJGRkJcXHUzMDAwLVxcdTMwM0VcXHUzMDQxLVxcdTMwOTZcXHUzMDk5LVxcdTMwRkZcXHUzMTA1LVxcdTMxMkRcXHUzMTMxLVxcdTMxOEVcXHUzMTkwLVxcdTMxQkFcXHUzMUMwLVxcdTMxRTNcXHUzMUYwLVxcdTMyMUVcXHUzMjIwLVxcdTMyNDdcXHUzMjUwLVxcdTMyRkVcXHUzMzAwLVxcdTREQkZcXHU0RTAwLVxcdUE0OENcXHVBNDkwLVxcdUE0QzZcXHVBOTYwLVxcdUE5N0NcXHVBQzAwLVxcdUQ3QTNcXHVEN0IwLVxcdUQ3QzZcXHVEN0NCLVxcdUQ3RkJcXHVGOTAwLVxcdUZBRkZcXHVGRTEwLVxcdUZFMTlcXHVGRTMwLVxcdUZFNTJcXHVGRTU0LVxcdUZFNjZcXHVGRTY4LVxcdUZFNkJcXHVGRjAxLVxcdUZGNjBcXHVGRkUwLVxcdUZGRTZdL2c7XG4gICAgICAgIHZhciByZXBsYWNlRnVuYyA9IGZ1bmN0aW9uKGMsIGEsIGIsIHRhYklkeCwgaWR4NCkge1xuICAgICAgICAgICAgaWYgKGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5zaG93SW52aXNpYmxlcyA/XG4gICAgICAgICAgICAgICAgICAgIFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZSc+XCIgKyBzdHJpbmdSZXBlYXQoc2VsZi5TUEFDRV9DSEFSLCBjLmxlbmd0aCkgKyBcIjwvc3Bhbj5cIiA6XG4gICAgICAgICAgICAgICAgICAgIHN0cmluZ1JlcGVhdChcIlxceGEwXCIsIGMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PSBcIiZcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIiYjMzg7XCI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCI8XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCImIzYwO1wiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFiU2l6ZSA9IHNlbGYuc2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbiArIHRhYklkeCk7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IHRhYlNpemUgLSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBzZWxmLiR0YWJTdHJpbmdzW3RhYlNpemVdO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiXFx1MzAwMFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gVSszMDAwIGlzIGJvdGggaW52aXNpYmxlIEFORCBmdWxsLXdpZHRoLCBzbyBtdXN0IGJlIGhhbmRsZWQgdW5pcXVlbHlcbiAgICAgICAgICAgICAgICB2YXIgY2xhc3NUb1VzZSA9IHNlbGYuc2hvd0ludmlzaWJsZXMgPyBcImFjZV9jamsgYWNlX2ludmlzaWJsZSBhY2VfaW52aXNpYmxlX3NwYWNlXCIgOiBcImFjZV9jamtcIjtcbiAgICAgICAgICAgICAgICB2YXIgc3BhY2UgPSBzZWxmLnNob3dJbnZpc2libGVzID8gc2VsZi5TUEFDRV9DSEFSIDogXCJcIjtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCI8c3BhbiBjbGFzcz0nXCIgKyBjbGFzc1RvVXNlICsgXCInIHN0eWxlPSd3aWR0aDpcIiArXG4gICAgICAgICAgICAgICAgICAgIChzZWxmLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCAqIDIpICtcbiAgICAgICAgICAgICAgICAgICAgXCJweCc+XCIgKyBzcGFjZSArIFwiPC9zcGFuPlwiO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J2FjZV9pbnZpc2libGUgYWNlX2ludmlzaWJsZV9zcGFjZSBhY2VfaW52YWxpZCc+XCIgKyBzZWxmLlNQQUNFX0NIQVIgKyBcIjwvc3Bhbj5cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiPHNwYW4gY2xhc3M9J2FjZV9jamsnIHN0eWxlPSd3aWR0aDpcIiArXG4gICAgICAgICAgICAgICAgICAgIChzZWxmLmNvbmZpZy5jaGFyYWN0ZXJXaWR0aCAqIDIpICtcbiAgICAgICAgICAgICAgICAgICAgXCJweCc+XCIgKyBjICsgXCI8L3NwYW4+XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb3V0cHV0ID0gdmFsdWUucmVwbGFjZShyZXBsYWNlUmVnLCByZXBsYWNlRnVuYyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiR0ZXh0VG9rZW5bdG9rZW4udHlwZV0pIHtcbiAgICAgICAgICAgIHZhciBjbGFzc2VzID0gXCJhY2VfXCIgKyB0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi9nLCBcIiBhY2VfXCIpO1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gXCJcIjtcbiAgICAgICAgICAgIGlmICh0b2tlbi50eXBlID09IFwiZm9sZFwiKVxuICAgICAgICAgICAgICAgIHN0eWxlID0gXCIgc3R5bGU9J3dpZHRoOlwiICsgKHRva2VuLnZhbHVlLmxlbmd0aCAqIHRoaXMuY29uZmlnLmNoYXJhY3RlcldpZHRoKSArIFwicHg7JyBcIjtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjxzcGFuIGNsYXNzPSdcIiwgY2xhc3NlcywgXCInXCIsIHN0eWxlLCBcIj5cIiwgb3V0cHV0LCBcIjwvc3Bhbj5cIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2gob3V0cHV0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2NyZWVuQ29sdW1uICsgdmFsdWUubGVuZ3RoO1xuICAgIH1cblxuICAgIC8vIEZJWE1FOyBIb3cgY2FuIG1heCBiZSBvcHRpb25hbCBpZiBpdCBpcyBhbHdheXMgdXNlZD9cbiAgICBwcml2YXRlIHJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXI6IChudW1iZXIgfCBzdHJpbmcpW10sIHZhbHVlOiBzdHJpbmcsIG1heD86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHZhciBjb2xzID0gdmFsdWUuc2VhcmNoKHRoaXMuJGluZGVudEd1aWRlUmUpO1xuICAgICAgICBpZiAoY29scyA8PSAwIHx8IGNvbHMgPj0gbWF4KVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBpZiAodmFsdWVbMF0gPT09IFwiIFwiKSB7XG4gICAgICAgICAgICBjb2xzIC09IGNvbHMgJSB0aGlzLnRhYlNpemU7XG4gICAgICAgICAgICBzdHJpbmdCdWlsZGVyLnB1c2goc3RyaW5nUmVwZWF0KHRoaXMuJHRhYlN0cmluZ3NbXCIgXCJdLCBjb2xzIC8gdGhpcy50YWJTaXplKSk7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUuc3Vic3RyKGNvbHMpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlWzBdID09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChzdHJpbmdSZXBlYXQodGhpcy4kdGFiU3RyaW5nc1tcIlxcdFwiXSwgY29scykpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnN1YnN0cihjb2xzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlcjogKG51bWJlciB8IHN0cmluZylbXSwgdG9rZW5zOiBUb2tlbltdLCBzcGxpdHM6IG51bWJlcltdLCBvbmx5Q29udGVudHMpIHtcbiAgICAgICAgdmFyIGNoYXJzID0gMDtcbiAgICAgICAgdmFyIHNwbGl0ID0gMDtcbiAgICAgICAgdmFyIHNwbGl0Q2hhcnMgPSBzcGxpdHNbMF07XG4gICAgICAgIHZhciBzY3JlZW5Db2x1bW4gPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIGlmIChpID09IDAgJiYgdGhpcy5kaXNwbGF5SW5kZW50R3VpZGVzKSB7XG4gICAgICAgICAgICAgICAgY2hhcnMgPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnJlbmRlckluZGVudEd1aWRlKHN0cmluZ0J1aWxkZXIsIHZhbHVlLCBzcGxpdENoYXJzKTtcbiAgICAgICAgICAgICAgICBpZiAoIXZhbHVlKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjaGFycyAtPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjaGFycyArIHZhbHVlLmxlbmd0aCA8IHNwbGl0Q2hhcnMpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY2hhcnMgKyB2YWx1ZS5sZW5ndGggPj0gc3BsaXRDaGFycykge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuLCB2YWx1ZS5zdWJzdHJpbmcoMCwgc3BsaXRDaGFycyAtIGNoYXJzKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZyhzcGxpdENoYXJzIC0gY2hhcnMpO1xuICAgICAgICAgICAgICAgICAgICBjaGFycyA9IHNwbGl0Q2hhcnM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFvbmx5Q29udGVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcIjwvZGl2PlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCwgXCJweCc+XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzcGxpdCsrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgICAgICBzcGxpdENoYXJzID0gc3BsaXRzW3NwbGl0XSB8fCBOdW1iZXIuTUFYX1ZBTFVFO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsdWUubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY2hhcnMgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIsIHNjcmVlbkNvbHVtbiwgdG9rZW4sIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpIHtcbiAgICAgICAgdmFyIHNjcmVlbkNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0b2tlbiA9IHRva2Vuc1swXTtcbiAgICAgICAgdmFyIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmRpc3BsYXlJbmRlbnRHdWlkZXMpXG4gICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVuZGVySW5kZW50R3VpZGUoc3RyaW5nQnVpbGRlciwgdmFsdWUpO1xuICAgICAgICBpZiAodmFsdWUpXG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0b2tlbiA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBzY3JlZW5Db2x1bW4gPSB0aGlzLiRyZW5kZXJUb2tlbihzdHJpbmdCdWlsZGVyLCBzY3JlZW5Db2x1bW4sIHRva2VuLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyByb3cgaXMgZWl0aGVyIGZpcnN0IHJvdyBvZiBmb2xkbGluZSBvciBub3QgaW4gZm9sZFxuICAgIHByaXZhdGUgJHJlbmRlckxpbmUoc3RyaW5nQnVpbGRlcjogKG51bWJlciB8IHN0cmluZylbXSwgcm93OiBudW1iZXIsIG9ubHlDb250ZW50czogYm9vbGVhbiwgZm9sZExpbmUvKjogRm9sZExpbmV8Ym9vbGVhbiovKSB7XG4gICAgICAgIGlmICghZm9sZExpbmUgJiYgZm9sZExpbmUgIT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5zZXNzaW9uLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBUb2tlbltdID0gdGhpcy4kZ2V0Rm9sZExpbmVUb2tlbnMocm93LCBmb2xkTGluZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHZhciB0b2tlbnM6IFRva2VuW10gPSB0aGlzLnNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG5cblxuICAgICAgICBpZiAoIW9ubHlDb250ZW50cykge1xuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFxuICAgICAgICAgICAgICAgIFwiPGRpdiBjbGFzcz0nYWNlX2xpbmUnIHN0eWxlPSdoZWlnaHQ6XCIsXG4gICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGluZUhlaWdodCAqIChcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXNlTGluZUdyb3VwcygpID8gMSA6IHRoaXMuc2Vzc2lvbi5nZXRSb3dMZW5ndGgocm93KVxuICAgICAgICAgICAgICAgICksIFwicHgnPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2UgbWF5IG5vdCBnZXQgdG9rZW5zIGlmIHRoZXJlIGlzIG5vIGxhbmd1YWdlIG1vZGUuXG4gICAgICAgIGlmICh0b2tlbnMgJiYgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSB0aGlzLnNlc3Npb24uZ2V0Um93U3BsaXREYXRhKHJvdyk7XG4gICAgICAgICAgICBpZiAoc3BsaXRzICYmIHNwbGl0cy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyV3JhcHBlZExpbmUoc3RyaW5nQnVpbGRlciwgdG9rZW5zLCBzcGxpdHMsIG9ubHlDb250ZW50cyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kcmVuZGVyU2ltcGxlTGluZShzdHJpbmdCdWlsZGVyLCB0b2tlbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc2hvd0ludmlzaWJsZXMpIHtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93XG5cbiAgICAgICAgICAgIHN0cmluZ0J1aWxkZXIucHVzaChcbiAgICAgICAgICAgICAgICBcIjxzcGFuIGNsYXNzPSdhY2VfaW52aXNpYmxlIGFjZV9pbnZpc2libGVfZW9sJz5cIixcbiAgICAgICAgICAgICAgICByb3cgPT0gdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpIC0gMSA/IHRoaXMuRU9GX0NIQVIgOiB0aGlzLkVPTF9DSEFSLFxuICAgICAgICAgICAgICAgIFwiPC9zcGFuPlwiXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghb25seUNvbnRlbnRzKVxuICAgICAgICAgICAgc3RyaW5nQnVpbGRlci5wdXNoKFwiPC9kaXY+XCIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldEZvbGRMaW5lVG9rZW5zKHJvdzogbnVtYmVyLCBmb2xkTGluZTogRm9sZExpbmUpOiBUb2tlbltdIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByZW5kZXJUb2tlbnM6IFRva2VuW10gPSBbXTtcblxuICAgICAgICBmdW5jdGlvbiBhZGRUb2tlbnModG9rZW5zOiBUb2tlbltdLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgICAgIHZhciBpZHggPSAwLCBjb2wgPSAwO1xuICAgICAgICAgICAgd2hpbGUgKChjb2wgKyB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGgpIDwgZnJvbSkge1xuICAgICAgICAgICAgICAgIGNvbCArPSB0b2tlbnNbaWR4XS52YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgaWR4Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAoaWR4ID09IHRva2Vucy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb2wgIT0gZnJvbSkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlLnN1YnN0cmluZyhmcm9tIC0gY29sKTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgdG9rZW4gdmFsdWUgaXMgbG9uZ2VyIHRoZW4gdGhlIGZyb20uLi50byBzcGFjaW5nLlxuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPiAodG8gLSBmcm9tKSlcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgdG8gLSBmcm9tKTtcblxuICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogdG9rZW5zW2lkeF0udHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjb2wgPSBmcm9tICsgdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAoY29sIDwgdG8gJiYgaWR4IDwgdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vuc1tpZHhdLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggKyBjb2wgPiB0bykge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlbnNbaWR4XS50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLnN1YnN0cmluZygwLCB0byAtIGNvbClcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlclRva2Vucy5wdXNoKHRva2Vuc1tpZHhdKTtcbiAgICAgICAgICAgICAgICBjb2wgKz0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VucyA9IHNlc3Npb24uZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uLCBpc05ld1Jvdykge1xuICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJUb2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChpc05ld1JvdylcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gc2Vzc2lvbi5nZXRUb2tlbnMocm93KTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICBhZGRUb2tlbnModG9rZW5zLCBsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmb2xkTGluZS5lbmQucm93LCB0aGlzLnNlc3Npb24uZ2V0TGluZShmb2xkTGluZS5lbmQucm93KS5sZW5ndGgpO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJUb2tlbnM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXNlTGluZUdyb3VwcygpOiBib29sZWFuIHtcbiAgICAgICAgLy8gRm9yIHRoZSB1cGRhdGVMaW5lcyBmdW5jdGlvbiB0byB3b3JrIGNvcnJlY3RseSwgaXQncyBpbXBvcnRhbnQgdGhhdCB0aGVcbiAgICAgICAgLy8gY2hpbGQgbm9kZXMgb2YgdGhpcy5lbGVtZW50IGNvcnJlc3BvbmQgb24gYSAxLXRvLTEgYmFzaXMgdG8gcm93cyBpbiB0aGVcbiAgICAgICAgLy8gZG9jdW1lbnQgKGFzIGRpc3RpbmN0IGZyb20gbGluZXMgb24gdGhlIHNjcmVlbikuIEZvciBzZXNzaW9ucyB0aGF0IGFyZVxuICAgICAgICAvLyB3cmFwcGVkLCB0aGlzIG1lYW5zIHdlIG5lZWQgdG8gYWRkIGEgbGF5ZXIgdG8gdGhlIG5vZGUgaGllcmFyY2h5ICh0YWdnZWRcbiAgICAgICAgLy8gd2l0aCB0aGUgY2xhc3MgbmFtZSBhY2VfbGluZV9ncm91cCkuXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGRlc3Ryb3lcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBkZXN0cm95KCk6IHZvaWQge1xuICAgICAgICBjbGVhckludGVydmFsKHRoaXMuJHBvbGxTaXplQ2hhbmdlc1RpbWVyKTtcbiAgICAgICAgaWYgKHRoaXMuJG1lYXN1cmVOb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiRtZWFzdXJlTm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuJG1lYXN1cmVOb2RlKTtcbiAgICAgICAgfVxuICAgICAgICBkZWxldGUgdGhpcy4kbWVhc3VyZU5vZGU7XG4gICAgfVxufVxuIl19