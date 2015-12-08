import EditorDocument from './lib/EditorDocument';
import EditSession from './lib/EditSession';
import JavaScriptMode from './lib/mode/JavaScriptMode';
import Editor from './lib/Editor';
import VirtualRenderer from './lib/VirtualRenderer';

var doc = new EditorDocument("// Hello, World!\nvar x = 3;\nvar y = 4;\n");
var mode = new JavaScriptMode()

var editSession = new EditSession(doc, mode);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
// renderer.setTheme...
var editor = new Editor(renderer, editSession);

console.log("What's up?")