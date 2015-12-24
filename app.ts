import Delta from './src/Delta';
import Document from './src/Document';
import Editor from './src/Editor';
import EditSession from './src/EditSession';
import JavaScriptMode from './src/mode/JavaScriptMode';
import VirtualRenderer from './src/VirtualRenderer';

export function main(element1: HTMLElement, element2: HTMLElement): void {

    /**
     * scripts that worker threads need to load.
     *
     * 1. We have to load system.js because it is an ES6 shim.
     * 2. We have to load config.js to configure System.
     * 3. We could load the corresponding worker code on-demand by configuring 'bundles'.
     */
    var scriptImports = [
        'jspm_packages/system.js',
        'config.js',
        'jspm_packages/github/ace2ts/ace-workers@0.1.8/dist/ace-workers.js'];

    var code = '// comment\n"use strict";\nvar x = 0;\nvar y = 1;\n';

    var doc1 = new Document('');
    var session1 = new EditSession(doc1);
    session1.setLanguageMode(new JavaScriptMode('worker.js', scriptImports));
    session1.setTabSize(2);
    var renderer1 = new VirtualRenderer(element1);
    // We could consider bundling CSS loading.
    // This isn't so bad when we have an application cache.
    renderer1.setThemeCss("ace-twilight", "/assets/css/twilight.css");
    renderer1.addCssClass("ace_dark");
    renderer1.setPadding(4);
    var editor1 = new Editor(renderer1, session1);
    editor1.setFontSize("16px");
    editor1.setValue(code);
    editor1.clearSelection();
    editor1.setShowInvisibles(true);
    editor1.setShowPrintMargin(false);
    editor1.resize();
    editor1.focus();

    var doc2 = new Document('');
    var session2 = new EditSession(doc2);
    session2.setLanguageMode(new JavaScriptMode('worker.js', scriptImports));
    var renderer2 = new VirtualRenderer(element2);
    renderer2.setThemeCss("ace-tm", "/assets/css/textmate.css");
    renderer2.addCssClass("ace_dark");
    renderer2.setPadding(4);
    var editor2 = new Editor(renderer2, session2);
    editor2.setFontSize("16px");
    editor2.setValue(code);
    editor2.clearSelection();
    editor2.setShowInvisibles(true);
    editor2.setShowPrintMargin(false);
    editor2.resize();
    editor2.blur();

    editor1.on('change', function(event: { data: Delta }, source: Editor) {
        var delta = event.data;
        var action = delta.action;
        var range = delta.range;
        console.log(JSON.stringify(delta));
    });

}