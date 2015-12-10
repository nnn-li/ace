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

import {getInnerText} from "./lib/dom";
import {addListener, removeListener} from "./lib/event";
import Editor from "./Editor";
import EditorDocument from "./EditorDocument";
import EditSession from "./EditSession";
import UndoManager from "./UndoManager";
import VirtualRenderer from "./VirtualRenderer";

// The following require()s are for inclusion in the built ace file
import HtmlMode from "./mode/HtmlMode";
import HtmlWorker from "./mode/HtmlWorker";

export function edit(source: any) {
    var element: HTMLElement;
    if (typeof source === 'string') {
        var id: string = source;
        element = document.getElementById(id);
        if (!element) {
            throw new Error("edit can't find div #" + id);
        }
    }
    else {
        element = source;
    }

    if (element && element['env'] && element['env'].editor instanceof Editor) {
        return element['env'].editor;
    }

    var value = "";
    if (element && /input|textarea/i.test(element.tagName)) {
        var oldNode: any = element;
        value = oldNode.value;
        element = document.createElement("pre");
        oldNode.parentNode.replaceChild(element, oldNode);
    }
    else {
        value = getInnerText(element);
        element.innerHTML = '';
    }

    var editSession = createEditSession(new EditorDocument(value), new HtmlMode());

    var editor = new Editor(new VirtualRenderer(element), editSession);

    // FIXME: The first property is incorrectly named.
    var env = {
        document: editSession,
        editor: editor,
        onResize: editor.resize.bind(editor, null)
    };

    if (oldNode) env['textarea'] = oldNode;

    addListener(window, "resize", env.onResize);

    editor.on("destroy", function() {
        removeListener(window, "resize", env.onResize);
        env.editor.container['env'] = null; // prevent memory leak on old ie
    });

    editor.container['env'] = editor['env'] = env;

    return editor;
};

export function createEditSession(doc: EditorDocument, mode?, callback?): EditSession {
    var editSession = new EditSession(doc, mode, callback);
    editSession.setUndoManager(new UndoManager());
    return editSession;
};
