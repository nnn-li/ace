/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
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
import Document from "./Document";
import EditSession from "./EditSession";
import UndoManager from "./UndoManager";
import VirtualRenderer from "./VirtualRenderer";
import {isDark, cssClass} from "./theme/twilight"

// The following require()s are for inclusion in the built ace file
//import HtmlMode from "./mode/HtmlMode";
//import HtmlWorker from "./mode/HtmlWorker";
//import JavaScriptMode from "./mode/JavaScriptMode";
//import JavaScriptWorker from "./mode/JavaScriptWorker";
//import TextMode from "./mode/TextMode";
//import TypeScriptMode from "./mode/TypeScriptMode";
//import TypeScriptWorker from "./mode/TypeScriptWorker";

/**
 * The main class required to set up an Ace instance in the browser.
 *
 * @class Ace
 */

/**
 * Embeds the Ace editor into the DOM, at the element provided by source.
 *
 * @method edit
 * @param source {string | HTMLElement}
 * @return {Editor}
 */
export function edit(source: string | HTMLElement): Editor {
    var element: HTMLElement;
    if (typeof source === 'string') {
        var id: string = source;
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
        var oldNode: any = element;
        value = oldNode.value;
        element = document.createElement("pre");
        oldNode.parentNode.replaceChild(element, oldNode);
    }
    else {
        value = getInnerText(element);
        element.innerHTML = '';
    }

    var editSession = createEditSession(new Document(value));
    // editSession.setLanguageMode(new TypeScriptMode());

    var renderer = new VirtualRenderer(element);

    renderer.setThemeCss({ isDark: isDark, id: cssClass, rel: 'stylesheet', type: 'text/css', href: '', padding: 0 }, '/assets/css/twilight.css');

    var editor = new Editor(renderer, editSession);

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

/**
 * Creates a new EditSession.
 *
 * @method createEditSession
 * @param doc {Document}
 * @return {EditSession}
 */
export function createEditSession(doc: Document): EditSession {
    var editSession = new EditSession(doc);
    editSession.setUndoManager(new UndoManager());
    return editSession;
};
