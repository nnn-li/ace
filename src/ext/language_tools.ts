/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
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

import Command = require('../commands/Command');
import snip = require("../snippets");
import acm = require("../autocomplete");
import config = require("../config");
import util = require("../autocomplete/util");
import Editor = require("../Editor");
import esm = require('../edit_session');
import tcm = require('../autocomplete/text_completer');

// Exports existing completer so that user can construct his own set of completers.
// export var textCompleter: acm.Completer = tcm;

export var keyWordCompleter: acm.Completer = {
    getCompletions: function(editor: Editor, session: esm.EditSession, pos: { row: number; column: number }, prefix: string, callback) {
        var state = editor.session.getState(pos.row);
        var completions = session.$mode.getCompletions(state, session, pos, prefix);
        callback(null, completions);
    }
};

export var snippetCompleter: acm.Completer = {
    getCompletions: function(editor: Editor, session: esm.EditSession, pos: { row: number; column: number }, prefix: string, callback) {
        var snippetMap = snip.snippetManager.snippetMap;
        var completions = [];
        snip.snippetManager.getActiveScopes(editor).forEach(function(scope) {
            var snippets = snippetMap[scope] || [];
            for (var i = snippets.length; i--;) {
                var s = snippets[i];
                var caption = s.name || s.tabTrigger;
                if (!caption)
                    continue;
                completions.push({
                    caption: caption,
                    snippet: s.content,
                    meta: s.tabTrigger && !s.name ? s.tabTrigger + "\u21E5 " : "snippet"
                });
            }
        }, this);
        callback(null, completions);
    }
};

var completers: acm.Completer[] = [snippetCompleter/*, textCompleter*/, keyWordCompleter];

export function addCompleter(completer: acm.Completer) {
    completers.push(completer);
};

var expandSnippet: Command = {
    name: 'expandSnippet',
    exec: function(editor: Editor) {
        var success = snip.snippetManager.expandWithTab(editor);
        if (!success) {
            editor.execCommand('indent');
        }
    },
    bindKey: 'Tab'
};

var onChangeMode = function(e, editor: Editor) {
    loadSnippetsForMode(editor.session.$mode);
};

var loadSnippetsForMode = function(mode: { $id: string; modes }) {
    var id = mode.$id;
    if (!snip.snippetManager['files']) {
        snip.snippetManager['files'] = {};
    }
    loadSnippetFile(id);
    if (mode.modes)
        mode.modes.forEach(loadSnippetsForMode);
};

var loadSnippetFile = function(id: string) {
    if (!id || snip.snippetManager['files'][id])
        return;
    var snippetFilePath = id.replace("mode", "snippets");
    snip.snippetManager['files'][id] = {};
    config.loadModule(snippetFilePath, function(m) {
        if (m) {
            snip.snippetManager['files'][id] = m;
            if (!m.snippets && m.snippetText)
                m.snippets = snip.snippetManager.parseSnippetFile(m.snippetText);
            snip.snippetManager.register(m.snippets || [], m.scope);
            if (m.includeScopes) {
                snip.snippetManager.snippetMap[m.scope].includeScopes = m.includeScopes;
                m.includeScopes.forEach(function(x) {
                    loadSnippetFile("ace/mode/" + x);
                });
            }
        }
    });
};

function getCompletionPrefix(editor: Editor) {
    var pos = editor.getCursorPosition();
    var line = editor.session.getLine(pos.row);
    var prefix = util.retrievePrecedingIdentifier(line, pos.column);
    // Try to find custom prefixes on the completers
    editor.completers.forEach(function(completer) {
        if (completer['identifierRegexps']) {
            completer['identifierRegexps'].forEach(function(identifierRegex) {
                if (!prefix && identifierRegex) {
                    prefix = util.retrievePrecedingIdentifier(line, pos.column, identifierRegex);
                }
            });
        }
    });
    return prefix;
}

var doLiveAutocomplete = function(e: { editor: Editor; command: { name: string }; args }) {
    var editor = e.editor;
    var text = e.args || "";
    var hasCompleter = acm.getCompleter(editor) && acm.getCompleter(editor).activated;

    // We don't want to autocomplete with no prefix
    if (e.command.name === "backspace") {
        if (hasCompleter && !getCompletionPrefix(editor))
            acm.getCompleter(editor).detach();
    }
    else if (e.command.name === "insertstring") {
        var prefix = getCompletionPrefix(editor);
        // Only autocomplete if there's a prefix that can be matched
        if (prefix && !hasCompleter) {
            if (!acm.getCompleter(editor)) {
                acm.setCompleter(editor, new acm.CompleterAggregate(editor));
            }
            // Disable autoInsert
            acm.getCompleter(editor).autoSelect = false;
            acm.getCompleter(editor).autoInsert = false;
            acm.getCompleter(editor).showPopup(editor);
        }
    }
};

config.defineOptions(Editor.prototype, 'editor', {
    enableBasicAutocompletion: {
        set: function(val) {
            var editor: Editor = this;
            if (val) {
                if (!editor.completers) {
                    editor.completers = Array.isArray(val) ? val : completers;
                }
                editor.commands.addCommand(acm.Autocomplete.startCommand);
            }
            else {
                editor.commands.removeCommand(acm.Autocomplete.startCommand.name);
            }
        },
        value: false
    },
    /**
     * Enable live autocomplete. If the value is an array, it is assumed to be an array of completers
     * and will use them instead of the default completers.
     */
    enableLiveAutocompletion: {
        set: function(val) {
            var editor: Editor = this;
            if (val) {
                if (!editor.completers) {
                    editor.completers = Array.isArray(val) ? val : completers;
                }
                // On each change automatically trigger the autocomplete
                editor.commands.on('afterExec', doLiveAutocomplete);
            }
            else {
                editor.commands.off('afterExec', doLiveAutocomplete);
            }
        },
        value: false
    },
    enableSnippets: {
        set: function(val) {
            var editor: Editor = this;
            if (val) {
                editor.commands.addCommand(expandSnippet);
                editor.on("changeMode", onChangeMode);
                onChangeMode(null, editor);
            }
            else {
                editor.commands.removeCommand(expandSnippet.name);
                editor.off("changeMode", onChangeMode);
            }
        },
        value: false
    }
});
