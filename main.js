import EditorDocument from './lib/EditorDocument';
import EditSession from './lib/EditSession';
import JavaScriptMode from './lib/mode/JavaScriptMode';
import Editor from './lib/Editor';
import VirtualRenderer from './lib/VirtualRenderer';

var doc = new EditorDocument("// Hello, World!");
var mode = new JavaScriptMode()

var editSession = new EditSession(doc, mode);

var element = document.getElementById('editor')
var theme = void 0; // Will default to textmate.
var renderer = new VirtualRenderer(element, theme);

var editor = new Editor(renderer, editSession);

console.log("What's up?")