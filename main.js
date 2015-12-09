import EditorDocument from './lib/EditorDocument';
import EditSession from './lib/EditSession';
import JavaScriptMode from './lib/mode/JavaScriptMode';
import Editor from './lib/Editor';
import VirtualRenderer from './lib/VirtualRenderer';

var doc = new EditorDocument("// Hello, World!\nvar x = 3;\nvar y = 4;\n");
var mode = new JavaScriptMode()

var editSession = new EditSession(doc, mode);
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);
editSession.setBreakpoints([2]);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
// renderer.setTheme...
var editor = new Editor(renderer, editSession);
// FIXME: This returns simply 12
console.log("fontSize => " + editor.getFontSize())
// But you must specify the units.
editor.setFontSize("24px");
editor.setHighlightActiveLine(false);
console.log("highlightActiveLine => " + editor.getHighlightActiveLine())
editor.setHighlightGutterLine(false);
console.log("highlightGutterLine => " + editor.getHighlightGutterLine())
editor.setHighlightSelectedWord(false);
console.log("highlightSelectedWord => " + editor.getHighlightSelectedWord())
editor.setAnimatedScroll(false);
console.log("animatedScroll => " + editor.getAnimatedScroll())
editor.setShowInvisibles(true);
console.log("showInvisibles => " + editor.getShowInvisibles())
console.log("behaviorsEnabled => " + editor.getBehavioursEnabled())

console.log("main.js completed without errors")