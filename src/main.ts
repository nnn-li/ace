"use strict";

import Editor from './Editor';
import EditorDocument from './EditorDocument';
import EditSession from './EditSession';
import VirtualRenderer from './VirtualRenderer';

import TextMode from './mode/TextMode';
import CssMode from './mode/CssMode';
import HtmlMode from './mode/HtmlMode';
import JavaScriptMode from './mode/JavaScriptMode';
import TypeScriptMode from './mode/TypeScriptMode';

import LanguageMode from './LanguageMode';
import Range from './Range';
import ThemeLink from './ThemeLink';

// var text = new TextMode()
// var mode = new CssMode()
// var mode = new HtmlMode()
// var mode = new JavaScriptMode()
// var mode = new TypeScriptMode()

var code = '// comment\n"use strict";\nvar x = 0;\nvar y = 1;\n';
//var code = '';

var doc = new EditorDocument(code);

var editSession = new EditSession(doc);
// editSession.setUseWorker(false);
// We can use module names to set the language mode.
// FIXME: Separate out the synchronous from the async?
//editSession.setMode(text);
editSession.importMode('lib/mode/JavaScriptMode')
    .then(function(mode: LanguageMode) {
        editSession.setMode(mode);
    }).catch(function(reason) {
        console.warn(`importMode() failed. Reason:  ${reason}`);
    });
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
//renderer.setAnnotations([]);
//renderer.setPadding(10);
renderer.importThemeLink('lib/theme/twilight')
    .then(function(themeLink: ThemeLink) {
        renderer.setThemeLink(themeLink)
    })
    .catch(function(reason) {
        console.warn(`importThemeLink() failed. Reason:  ${reason}`);
    });
//renderer.setAnimatedScroll(true);
//renderer.setCompositionText("Hello");
//renderer.setCursorStyle('yahoo');

//renderer.setDefaultHandler('', function() {
//});

//renderer.setMouseCursor('cursor-style');
//renderer.setScrollMargin(5, 5, 5, 5);
//renderer.setShowGutter(true);
//renderer.setShowInvisibles(true);
//renderer.setCursorLayerOff();
//renderer.setDefaultCursorStyle();
//renderer.setDisplayIndentGuides(true);
//renderer.setFadeFoldWidgets(true);
//renderer.setHighlightGutterLine(true);
//renderer.setPrintMarginColumn(23);
//renderer.setShowPrintMargin(true);
//renderer.setHScrollBarAlwaysVisible(true);
//renderer.setVScrollBarAlwaysVisible(true);

// The Editor acts as a controller between the renderer and the EditSession.
var editor = new Editor(renderer, editSession);
editor.setFontSize("20px");
//editor.setHighlightActiveLine(true);
// editor.setHighlightGutterLine(true); Why repeated?
//editor.setHighlightSelectedWord(true);
//editor.setAnimatedScroll(false);  // Why repeated?
//editor.setShowInvisibles(true); // Why repeated
