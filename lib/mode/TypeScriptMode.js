"use strict";
import JavaScriptMode from "./JavaScriptMode";
import TypeScriptHighlightRules from "./TypeScriptHighlightRules";
import CstyleBehaviour from "./behaviour/CstyleBehaviour";
import CStyleFoldMode from "./folding/CstyleFoldMode";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
export default class TypeScriptMode extends JavaScriptMode {
    constructor() {
        super();
        this.$id = "ace/mode/typescript";
        this.HighlightRules = TypeScriptHighlightRules;
        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CstyleBehaviour();
        this.foldingRules = new CStyleFoldMode();
    }
    createWorker(session) {
        var worker = new WorkerClient("lib/worker/worker-systemjs.js");
        worker.on("initAfter", function (event) {
            worker.attachToDocument(session.getDocument());
            session._emit("initAfter", { data: event.data });
        });
        worker.on("terminate", function () {
            session.clearAnnotations();
        });
        worker.on("compileErrors", function (event) {
            session.setAnnotations(event.data);
            session._emit("compileErrors", { data: event.data });
        });
        worker.on("compiled", function (event) {
            session._emit("compiled", { data: event.data });
        });
        worker.on("getFileNames", function (event) {
            session._emit("getFileNames", { data: event.data });
        });
        worker.init("lib/mode/TypeScriptWorker");
        return worker;
    }
    ;
}