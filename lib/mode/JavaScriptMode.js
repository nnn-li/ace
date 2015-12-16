"use strict";
import TextMode from "./TextMode";
import JavaScriptHighlightRules from "./JavaScriptHighlightRules";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
import CstyleBehaviour from "./behaviour/CstyleBehaviour";
import CStyleFoldMode from "./folding/CstyleFoldMode";
export default class JavaScriptMode extends TextMode {
    constructor() {
        super();
        this.HighlightRules = JavaScriptHighlightRules;
        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CstyleBehaviour();
        this.foldingRules = new CStyleFoldMode();
        this.lineCommentStart = "//";
        this.blockComment = { start: "/*", end: "*/" };
        this.$id = "ace/mode/javascript";
    }
    getNextLineIndent(state, line, tab) {
        var indent = this.$getIndent(line);
        var tokenizedLine = this.getTokenizer().getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;
        if (tokens.length && tokens[tokens.length - 1].type == "comment") {
            return indent;
        }
        if (state === "start" || state === "no_regex") {
            var match = line.match(/^.*(?:\bcase\b.*\:|[\{\(\[])\s*$/);
            if (match) {
                indent += tab;
            }
        }
        else if (state === "doc-start") {
            if (endState == "start" || endState == "no_regex") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
        }
        return indent;
    }
    checkOutdent(state, line, text) {
        return this.$outdent.checkOutdent(line, text);
    }
    ;
    autoOutdent(state, session, row) {
        return this.$outdent.autoOutdent(session, row);
    }
    ;
    createWorker(session) {
        var path = 'jspm_packages/github/geometryzen/ace2016@0.1.22';
        var worker = new WorkerClient(`${path}/worker/worker-systemjs.js`);
        worker.on("initAfter", function () {
            worker.attachToDocument(session.getDocument());
        });
        worker.on("errors", function (errors) {
            session.setAnnotations(errors.data);
        });
        worker.on("terminate", function () {
            session.clearAnnotations();
        });
        worker.init("lib/mode/JavaScriptWorker");
        return worker;
    }
}
