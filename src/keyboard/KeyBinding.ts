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
"use strict";

import { keyCodeToString } from "../lib/keys"
import { stopEvent } from "../lib/event"
import Editor from "../Editor"
import HashHandler from "./HashHandler"
import Command from "../commands/Command";

/**
 * @class KeyBinding
 */
export default class KeyBinding {
    $editor: Editor;
    $data;
    $handlers: HashHandler[];
    $defaultHandler: HashHandler;

    /**
     * @class KeyBinding
     * @constructor
     * @param editor {Editor}
     */
    constructor(editor: Editor) {
        this.$editor = editor;
        this.$data = { editor: editor };
        this.$handlers = [];
        this.setDefaultHandler(editor.commands);
    }

    /**
     * @method setDefaultHandler
     * @param kb {HashHandler}
     * @return {void}
     */
    setDefaultHandler(kb: HashHandler): void {
        this.removeKeyboardHandler(this.$defaultHandler);
        this.$defaultHandler = kb;
        this.addKeyboardHandler(kb, 0);
    }

    /**
     * @method setKeyboardHandler
     * @param kb {HashHandler}
     * @return {void}
     */
    setKeyboardHandler(kb: HashHandler): void {
        var h = this.$handlers;
        if (h[h.length - 1] === kb)
            return;

        while (h[h.length - 1] && h[h.length - 1] != this.$defaultHandler)
            this.removeKeyboardHandler(h[h.length - 1]);

        this.addKeyboardHandler(kb, 1);
    }

    addKeyboardHandler(kb: any | HashHandler/*: CommandManager*/, pos?: number) {
        if (!kb)
            return;
        if (typeof kb === "function" && !kb.handleKeyboard) {
            kb.handleKeyboard = kb;
        }
        else if (kb instanceof HashHandler) {
            var i = this.$handlers.indexOf(kb);
            if (i !== -1)
                this.$handlers.splice(i, 1);

            if (pos === void 0)
                this.$handlers.push(kb);
            else
                this.$handlers.splice(pos, 0, kb);

            if (i === -1 && kb.attach) {
                kb.attach(this.$editor);
            }
        }
    }

    /**
     * @method removeKeyboardHandler
     * @param kb
     * @return {boolean}
     */
    removeKeyboardHandler(kb: /*HashHandler*/any): boolean {
        var i = this.$handlers.indexOf(kb);
        if (i === -1) {
            return false;
        }
        this.$handlers.splice(i, 1);
        kb.detach && kb.detach(this.$editor);
        return true;
    }

    /**
     * @method getKeyboardHandler
     * @return {HashHandler}
     */
    getKeyboardHandler(): HashHandler {
        return this.$handlers[this.$handlers.length - 1];
    }

    $callKeyboardHandlers(hashId: number, keyString: string, keyCode?: number, e?): boolean {
        // FIXME: What is going on here?
        var toExecute: { command/*: Command*/; args?; passEvent?};
        var success = false;
        var commands = this.$editor.commands;

        for (var i = this.$handlers.length; i--;) {
            toExecute = this.$handlers[i].handleKeyboard(this.$data, hashId, keyString, keyCode, e);
            if (!toExecute || !toExecute.command)
                continue;
            
            // allow keyboardHandler to consume keys
            if (toExecute.command == "null") {
                success = true;
            }
            else {
                success = commands.exec(toExecute.command, this.$editor, toExecute.args);
            }
            // do not stop input events to not break repeating
            if (success && e && hashId != -1 && toExecute.passEvent != true && toExecute.command.passEvent != true) {
                stopEvent(e);
            }
            if (success)
                break;
        }
        return success;
    }

    onCommandKey(e, hashId: number, keyCode: number): void {
        var keyString = keyCodeToString(keyCode);
        this.$callKeyboardHandlers(hashId, keyString, keyCode, e);
    }

    /**
     * @method onTextInput
     * @param text {string}
     * @return {void}
     */
    onTextInput(text: string): void {
        var success = this.$callKeyboardHandlers(-1, text);
        if (!success) {
            this.$editor.commands.exec("insertstring", this.$editor, text);
        }
    }
}
