/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
//require("./lib/fixoldbrowsers");
define(["require", "exports", "./lib/dom", "./lib/event", "./Editor", "./EditorDocument", "./EditSession", "./UndoManager", "./VirtualRenderer", "./mode/JavaScriptMode"], function (require, exports, dom_1, event_1, Editor_1, EditorDocument_1, EditSession_1, UndoManager_1, VirtualRenderer_1, JavaScriptMode_1) {
    function edit(source) {
        var element;
        if (typeof source === 'string') {
            var id = source;
            element = document.getElementById(id);
            if (!element) {
                throw new Error("edit can't find div #" + id);
            }
        }
        else {
            element = source;
        }
        if (element && element['env'] && element['env'].editor instanceof Editor_1.default) {
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
            value = dom_1.getInnerText(element);
            element.innerHTML = '';
        }
        var editSession = createEditSession(new EditorDocument_1.default(value), new JavaScriptMode_1.default());
        var editor = new Editor_1.default(new VirtualRenderer_1.default(element), editSession);
        // FIXME: The first property is incorrectly named.
        var env = {
            document: editSession,
            editor: editor,
            onResize: editor.resize.bind(editor, null)
        };
        if (oldNode)
            env['textarea'] = oldNode;
        event_1.addListener(window, "resize", env.onResize);
        editor.on("destroy", function () {
            event_1.removeListener(window, "resize", env.onResize);
            env.editor.container['env'] = null; // prevent memory leak on old ie
        });
        editor.container['env'] = editor['env'] = env;
        return editor;
    }
    exports.edit = edit;
    ;
    function createEditSession(doc, mode, callback) {
        var editSession = new EditSession_1.default(doc, mode, callback);
        editSession.setUndoManager(new UndoManager_1.default());
        return editSession;
    }
    exports.createEditSession = createEditSession;
    ;
});
