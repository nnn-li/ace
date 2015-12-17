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
        return new Promise(function (success, fail) {
            System.normalize('geometryzen/ace2016/worker/worker-system.js', '', '')
                .then(function (workerUrl) {
                var worker = new WorkerClient(workerUrl);
                var mode = this;
                worker.on("initAfter", function () {
                    worker.attachToDocument(session.getDocument());
                    success(worker);
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
                worker.init("geometryzen/ace2016/mode/HtmlWorker");
            })
                .catch(e => fail(e));
        });
    }
    ;
}
