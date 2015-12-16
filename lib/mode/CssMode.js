"use strict";
import TextMode from "./TextMode";
import CssHighlightRules from "./CssHighlightRules";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
import CssBehaviour from "./behaviour/CssBehaviour";
import CStyleFoldMode from "./folding/CstyleFoldMode";
export default class CssMode extends TextMode {
    constructor() {
        super();
        this.$id = "ace/mode/css";
        this.blockComment = { start: "/*", end: "*/" };
        this.HighlightRules = CssHighlightRules;
        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CssBehaviour();
        this.foldingRules = new CStyleFoldMode();
    }
    getNextLineIndent(state, line, tab) {
        var indent = this.$getIndent(line);
        var tokens = this.getTokenizer().getLineTokens(line, state).tokens;
        if (tokens.length && tokens[tokens.length - 1].type == "comment") {
            return indent;
        }
        var match = line.match(/^.*\{\s*$/);
        if (match) {
            indent += tab;
        }
        return indent;
    }
    checkOutdent(state, line, text) {
        return this.$outdent.checkOutdent(line, text);
    }
    autoOutdent(state, session, row) {
        return this.$outdent.autoOutdent(session, row);
    }
    createWorker(session) {
        var worker = new WorkerClient("lib/worker/worker-systemjs.js");
        worker.on("initAfter", function () {
            worker.attachToDocument(session.getDocument());
        });
        worker.on("csslint", function (e) {
            session.setAnnotations(e.data);
        });
        worker.on("terminate", function () {
            session.clearAnnotations();
        });
        worker.init("ace/mode/css_worker");
        return worker;
    }
}
