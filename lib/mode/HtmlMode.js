"use strict";
import { arrayToMap } from "../lib/lang";
import TextMode from "./TextMode";
import JavaScriptMode from "./JavaScriptMode";
import CssMode from "./CssMode";
import HtmlHighlightRules from "./HtmlHighlightRules";
import HtmlBehaviour from "./behaviour/HtmlBehaviour";
import HtmlFoldMode from "./folding/HtmlFoldMode";
import HtmlCompletions from "./HtmlCompletions";
import WorkerClient from "../worker/WorkerClient";
var voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
var optionalEndTags = ["li", "dt", "dd", "p", "rt", "rp", "optgroup", "option", "colgroup", "td", "th"];
export default class HtmlMode extends TextMode {
    constructor(options) {
        super();
        this.blockComment = { start: "<!--", end: "-->" };
        this.voidElements = arrayToMap(voidElements, 1);
        this.$id = "ace/mode/html";
        this.fragmentContext = options && options.fragmentContext;
        this.HighlightRules = HtmlHighlightRules;
        this.$behaviour = new HtmlBehaviour();
        this.$completer = new HtmlCompletions();
        this.createModeDelegates({
            "js-": JavaScriptMode,
            "css-": CssMode
        });
        this.foldingRules = new HtmlFoldMode(this.voidElements, arrayToMap(optionalEndTags, 1));
    }
    getNextLineIndent(state, line, tab) {
        return this.$getIndent(line);
    }
    checkOutdent(state, line, text) {
        return false;
    }
    getCompletions(state, session, pos, prefix) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    }
    createWorker(session) {
        var worker = new WorkerClient("lib/worker/worker-systemjs.js");
        var mode = this;
        worker.on("initAfter", function () {
            worker.attachToDocument(session.getDocument());
            if (mode.fragmentContext) {
                worker.call("setOptions", [{ context: mode.fragmentContext }]);
            }
        });
        worker.on("error", function (message) {
            session.setAnnotations(message.data);
        });
        worker.on("terminate", function () {
            session.clearAnnotations();
        });
        worker.init("lib/mode/HtmlWorker");
        return worker;
    }
    ;
}
