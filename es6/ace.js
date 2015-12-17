import { getInnerText } from "./lib/dom";
import { addListener, removeListener } from "./lib/event";
import Editor from "./Editor";
import Document from "./Document";
import EditSession from "./EditSession";
import UndoManager from "./UndoManager";
import VirtualRenderer from "./VirtualRenderer";
import { isDark, cssClass } from "./theme/twilight";
export function edit(source) {
    var element;
    if (typeof source === 'string') {
        var id = source;
        element = document.getElementById(id);
        if (!element) {
            throw new Error("edit can't find div #" + id);
        }
    }
    else if (source instanceof HTMLElement) {
        element = source;
    }
    else {
    }
    if (element && element['env'] && element['env'].editor instanceof Editor) {
        return element['env'].editor;
    }
    var value = "";
    if (element && /input|textarea/i.test(element.tagName)) {
        var oldNode = element;
        value = oldNode.value;
        element = document.createElement("pre");
        oldNode.parentNode.replaceChild(element, oldNode);
    }
    else {
        value = getInnerText(element);
        element.innerHTML = '';
    }
    var editSession = createEditSession(new Document(value));
    var renderer = new VirtualRenderer(element);
    renderer.setThemeCss({ isDark: isDark, id: cssClass, rel: 'stylesheet', type: 'text/css', href: '', padding: 0 }, '/assets/css/twilight.css');
    var editor = new Editor(renderer, editSession);
    var env = {
        document: editSession,
        editor: editor,
        onResize: editor.resize.bind(editor, null)
    };
    if (oldNode)
        env['textarea'] = oldNode;
    addListener(window, "resize", env.onResize);
    editor.on("destroy", function () {
        removeListener(window, "resize", env.onResize);
        env.editor.container['env'] = null;
    });
    editor.container['env'] = editor['env'] = env;
    return editor;
}
;
export function createEditSession(doc) {
    var editSession = new EditSession(doc);
    editSession.setUndoManager(new UndoManager());
    return editSession;
}
;
