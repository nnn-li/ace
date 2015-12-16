import Document from "../Document";
import EditSession from "../EditSession";
import VirtualRenderer from "../VirtualRenderer";
import Editor from "../Editor";
import Range from "../Range";
import { addListener } from "../lib/event";
import { stringRepeat } from "../lib/lang";
import { addCssClass, createElement, ensureHTMLStyleElement, removeCssClass } from "../lib/dom";
var noop = function () { };
export default class ListViewPopup {
    constructor(container) {
        this.$borderSize = 1;
        this.$imageSize = 0;
        this.hoverMarker = new Range(-1, 0, -1, Infinity);
        this.selectionMarker = new Range(-1, 0, -1, Infinity);
        this.isOpen = false;
        this.isTopdown = false;
        this.data = [];
        var self = this;
        function createEditor(el) {
            var renderer = new VirtualRenderer(el);
            renderer.content.style.cursor = "default";
            renderer.setStyle("ace_autocomplete");
            renderer.$cursorLayer.restartTimer = noop;
            renderer.$cursorLayer.element.style.opacity = "0";
            renderer.$maxLines = 8;
            renderer.$keepTextAreaAtCursor = false;
            var model = new Document("");
            var editSession = new EditSession(model);
            var editor = new Editor(renderer, editSession);
            editor.setHighlightActiveLine(false);
            editor.setShowPrintMargin(false);
            editor.renderer.setShowGutter(false);
            editor.renderer.setHighlightGutterLine(false);
            editor.setOption("displayIndentGuides", false);
            editor.setOption("dragDelay", 150);
            editor.focus = noop;
            editor.$isFocused = true;
            editor.setHighlightActiveLine(false);
            editor.getSession().$searchHighlight.clazz = "ace_highlight-marker";
            return editor;
        }
        var el = createElement("div");
        this.editor = createEditor(el);
        if (container) {
            container.appendChild(el);
        }
        el.style.display = "none";
        this.editor.on("mousedown", function (e) {
            var pos = e.getDocumentPosition();
            self.editor.selection.moveToPosition(pos);
            self.selectionMarker.start.row = self.selectionMarker.end.row = pos.row;
            e.stop();
        });
        this.selectionMarkerId = this.editor.getSession().addMarker(this.selectionMarker, "ace_active-line", "fullLine");
        this.setSelectOnHover(false);
        this.editor.on("mousemove", function (e) {
            if (!self.lastMouseEvent) {
                self.lastMouseEvent = e;
                return;
            }
            if (self.lastMouseEvent.x === e.x && self.lastMouseEvent.y === e.y) {
                return;
            }
            self.lastMouseEvent = e;
            self.lastMouseEventScrollTop = self.editor.renderer.scrollTop;
            var row = self.lastMouseEvent.getDocumentPosition().row;
            if (self.hoverMarker.start.row != row) {
                if (!self.hoverMarkerId) {
                    self.setRow(row);
                }
                self.setHoverMarker(row);
            }
        });
        this.editor.renderer.on("beforeRender", function () {
            if (self.lastMouseEvent && self.hoverMarker.start.row != -1) {
                self.lastMouseEvent.$pos = null;
                var row = self.lastMouseEvent.getDocumentPosition().row;
                if (!self.hoverMarkerId) {
                    self.setRow(row);
                }
                self.setHoverMarker(row, true);
            }
        });
        this.editor.renderer.on("afterRender", function () {
            var row = self.getRow();
            var t = self.editor.renderer.$textLayer;
            var selected = t.element.childNodes[row - t.config.firstRow];
            if (selected == t['selectedNode'])
                return;
            if (t['selectedNode'])
                removeCssClass(t['selectedNode'], "ace_selected");
            t['selectedNode'] = selected;
            if (selected)
                addCssClass(selected, "ace_selected");
        });
        function hideHoverMarker() { self.setHoverMarker(-1); }
        addListener(this.editor.container, "mouseout", hideHoverMarker);
        this.editor.on("hide", hideHoverMarker);
        this.editor.on("changeSelection", hideHoverMarker);
        this.editor.getSession().doc.getLength = function () {
            return self.data.length;
        };
        this.editor.getSession().doc.getLine = function (i) {
            var data = self.data[i];
            if (typeof data == "string") {
                return data;
            }
            return (data && data.value) || "";
        };
        var bgTokenizer = this.editor.getSession().bgTokenizer;
        bgTokenizer.tokenizeRow = function (row) {
            var data = self.data[row];
            var tokens = [];
            if (!data)
                return tokens;
            if (typeof data == "string")
                data = { value: data };
            if (!data.caption)
                data.caption = data.value || data.name;
            var last = -1;
            var flag, c;
            for (var cIndex = 0, length = data.caption.length; cIndex < length; cIndex++) {
                c = data.caption[cIndex];
                flag = data.matchMask & (1 << cIndex) ? 1 : 0;
                if (last !== flag) {
                    tokens.push({ type: data.className || "" + (flag ? "completion-highlight" : ""), value: c });
                    last = flag;
                }
                else {
                    tokens[tokens.length - 1].value += c;
                }
            }
            if (data.meta) {
                var maxW = self.editor.renderer.$size.scrollerWidth / self.editor.renderer.layerConfig.characterWidth;
                if (data.meta.length + data.caption.length < maxW - 2)
                    tokens.push({ type: "rightAlignedText", value: data.meta });
            }
            return tokens;
        };
        bgTokenizer.updateOnChange = noop;
        bgTokenizer.start = noop;
        this.editor.getSession().$computeWidth = function () {
            return self.screenWidth = 0;
        };
        this.editor.on("changeSelection", function () {
            if (this.isOpen) {
                this.setRow(this.popup.selection.lead.row);
            }
        });
    }
    show(pos, lineHeight, topdownOnly) {
        var el = this.editor.container;
        var screenHeight = window.innerHeight;
        var screenWidth = window.innerWidth;
        var renderer = this.editor.renderer;
        var maxH = renderer.$maxLines * lineHeight * 1.4;
        var top = pos.top + this.$borderSize;
        if (top + maxH > screenHeight - lineHeight && !topdownOnly) {
            el.style.top = "";
            el.style.bottom = screenHeight - top + "px";
            this.isTopdown = false;
        }
        else {
            top += lineHeight;
            el.style.top = top + "px";
            el.style.bottom = "";
            this.isTopdown = true;
        }
        el.style.display = "";
        renderer.$textLayer.checkForSizeChanges();
        var left = pos.left;
        if (left + el.offsetWidth > screenWidth) {
            left = screenWidth - el.offsetWidth;
        }
        el.style.left = left + "px";
        this.editor._signal("show");
        this.lastMouseEvent = null;
        this.isOpen = true;
    }
    hide() {
        this.editor.container.style.display = "none";
        this.editor._signal("hide");
        this.isOpen = false;
    }
    setData(list) {
        this.data = list || [];
        this.editor.setValue(stringRepeat("\n", list.length), -1);
        this.setRow(0);
    }
    getData(row) {
        return this.data[row];
    }
    on(eventName, callback, capturing) {
        return this.editor.on(eventName, callback, capturing);
    }
    getTextLeftOffset() {
        return this.$borderSize + this.editor.renderer.$padding + this.$imageSize;
    }
    setSelectOnHover(val) {
        if (!val) {
            this.hoverMarkerId = this.editor.getSession().addMarker(this.hoverMarker, "ace_line-hover", "fullLine");
        }
        else if (this.hoverMarkerId) {
            this.editor.getSession().removeMarker(this.hoverMarkerId);
            this.hoverMarkerId = null;
        }
    }
    setHoverMarker(row, suppressRedraw) {
        if (row !== this.hoverMarker.start.row) {
            this.hoverMarker.start.row = this.hoverMarker.end.row = row;
            if (!suppressRedraw) {
                this.editor.getSession()._emit("changeBackMarker");
            }
            this.editor._emit("changeHoverMarker");
        }
    }
    getHoveredRow() {
        return this.hoverMarker.start.row;
    }
    getRow() {
        return this.selectionMarker.start.row;
    }
    setRow(row) {
        row = Math.max(-1, Math.min(this.data.length, row));
        if (this.selectionMarker.start.row != row) {
            this.editor.selection.clearSelection();
            this.selectionMarker.start.row = this.selectionMarker.end.row = row || 0;
            this.editor.getSession()._emit("changeBackMarker");
            this.editor.moveCursorTo(row || 0, 0);
            if (this.isOpen) {
                this.editor._signal("select");
            }
        }
    }
    importThemeLink(themeName) {
        return this.editor.importThemeLink(themeName);
    }
    setFontSize(fontSize) {
        this.editor.setFontSize(fontSize);
    }
    get focus() {
        return this.editor.focus;
    }
    getLength() {
        return this.editor.getSession().getLength();
    }
    get container() {
        return this.editor.container;
    }
}
ensureHTMLStyleElement("\
.ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line {\
    background-color: #CAD6FA;\
    z-index: 1;\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    border: 1px solid #abbffe;\
    margin-top: -1px;\
    background: rgba(233,233,253,0.4);\
}\
.ace_editor.ace_autocomplete .ace_line-hover {\
    position: absolute;\
    z-index: 2;\
}\
.ace_editor.ace_autocomplete .ace_scroller {\
   background: none;\
   border: none;\
   box-shadow: none;\
}\
.ace_rightAlignedText {\
    color: gray;\
    display: inline-block;\
    position: absolute;\
    right: 4px;\
    text-align: right;\
    z-index: -1;\
}\
.ace_editor.ace_autocomplete .ace_completion-highlight{\
    color: #000;\
    text-shadow: 0 0 0.01em;\
}\
.ace_editor.ace_autocomplete {\
    width: 280px;\
    z-index: 200000;\
    background: #fbfbfb;\
    color: #444;\
    border: 1px lightgray solid;\
    position: fixed;\
    box-shadow: 2px 3px 5px rgba(0,0,0,.2);\
    line-height: 1.4;\
}");
