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

/**
 * The main class required to set up an Ace instance in the browser.
 *
 * @class Ace
 **/

//require("./lib/fixoldbrowsers");

import {getInnerText} from "./lib/dom";
import {addListener, removeListener} from "./lib/event";

import {wrap} from './triton';
import Editor from "./Editor";
import {} from "./edit_session";
import {} from "./undomanager";
import {VirtualRenderer} from "./virtual_renderer";
import {workspace, Workspace} from "./workspace/workspace";
import {} from './config';

// The following require()s are for inclusion in the built ace file
//require("./worker/worker_client");
//require("./keyboard/hash_handler");
//require("./placeholder");
//require("./multi_select");
//require("./mode/folding/fold_mode");
//require("./theme/textmate");
//require("./ext/error_marker");

// export var config = cfg;

/**
 * Provides access to require in packed noconflict mode
 * @param {String} moduleName
 * @returns {Object}
 **/
// FIXME: Trying to export this in the ACE namespace is problematic in TypeScript.
// export var require = require;

/**
 * Embeds the Ace editor into the DOM, at the element provided by `el`.
 * @param {String | DOMElement} el Either the id of an element, or the element itself
 */
export function edit(source: any, workspace: Workspace) {
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

    var editSession = createEditSession(value);

    var editor = new Editor(new VirtualRenderer(element));
    editor.setSession(editSession);

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
    return wrap(editor, element, workspace, document);
};

/**
 * Functional constructor for creating a new Workspace.
 */
export function workspace() {
    return workspace();
};

/**
 * Creates a new [[EditSession]], and returns the associated [[Document]].
 * @param {Document | String} text {:textParam}
 * @param {TextMode} mode {:modeParam}
 * 
 **/
export function createEditSession(text, mode?) {
    var doc = new EditSession(text, mode);
    doc.setUndoManager(new UndoManager());
    return doc;
};

export var EditSession = EditSession;

export var UndoManager = UndoManager;
