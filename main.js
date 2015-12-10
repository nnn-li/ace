import Editor from './lib/Editor';
import EditorDocument from './lib/EditorDocument';
import EditSession from './lib/EditSession';
import VirtualRenderer from './lib/VirtualRenderer';

import CssMode from './lib/mode/CssMode';
import HtmlMode from './lib/mode/HtmlMode';
import JavaScriptMode from './lib/mode/JavaScriptMode';

var cMode = new CssMode()
var hMode = new HtmlMode()
var jMode = new JavaScriptMode()

var code = "";

var doc = new EditorDocument(code);

var editSession = new EditSession(doc, hMode);
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
// renderer.setTheme...
// The Editor acts as a controller between the renderer and the EditSession.
var editor = new Editor(renderer, editSession);
editor.setFontSize("16px");
editor.setHighlightActiveLine(true);
editor.setHighlightGutterLine(true);
editor.setHighlightSelectedWord(true);
editor.setAnimatedScroll(false);
editor.setShowInvisibles(true);
