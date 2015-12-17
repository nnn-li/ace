"use strict";
import { keyCodeToString } from "../lib/keys";
import { stopEvent } from "../lib/event";
export default class KeyBinding {
    constructor(editor) {
        this.$editor = editor;
        this.$data = { editor: editor };
        this.$handlers = [];
        this.setDefaultHandler(editor.commands);
    }
    setDefaultHandler(kb) {
        this.removeKeyboardHandler(this.$defaultHandler);
        this.$defaultHandler = kb;
        this.addKeyboardHandler(kb, 0);
    }
    setKeyboardHandler(kb) {
        var h = this.$handlers;
        if (h[h.length - 1] === kb)
            return;
        while (h[h.length - 1] && h[h.length - 1] != this.$defaultHandler)
            this.removeKeyboardHandler(h[h.length - 1]);
        this.addKeyboardHandler(kb, 1);
    }
    addKeyboardHandler(kb, pos) {
        if (!kb)
            return;
        if (typeof kb == "function" && !kb.handleKeyboard)
            kb.handleKeyboard = kb;
        var i = this.$handlers.indexOf(kb);
        if (i != -1)
            this.$handlers.splice(i, 1);
        if (pos === void 0)
            this.$handlers.push(kb);
        else
            this.$handlers.splice(pos, 0, kb);
        if (i == -1 && kb.attach)
            kb.attach(this.$editor);
    }
    removeKeyboardHandler(kb) {
        var i = this.$handlers.indexOf(kb);
        if (i == -1)
            return false;
        this.$handlers.splice(i, 1);
        kb.detach && kb.detach(this.$editor);
        return true;
    }
    getKeyboardHandler() {
        return this.$handlers[this.$handlers.length - 1];
    }
    $callKeyboardHandlers(hashId, keyString, keyCode, e) {
        var toExecute;
        var success = false;
        var commands = this.$editor.commands;
        for (var i = this.$handlers.length; i--;) {
            toExecute = this.$handlers[i].handleKeyboard(this.$data, hashId, keyString, keyCode, e);
            if (!toExecute || !toExecute.command)
                continue;
            if (toExecute.command == "null") {
                success = true;
            }
            else {
                success = commands.exec(toExecute.command, this.$editor, toExecute.args);
            }
            if (success && e && hashId != -1 && toExecute.passEvent != true && toExecute.command.passEvent != true) {
                stopEvent(e);
            }
            if (success)
                break;
        }
        return success;
    }
    onCommandKey(e, hashId, keyCode) {
        var keyString = keyCodeToString(keyCode);
        this.$callKeyboardHandlers(hashId, keyString, keyCode, e);
    }
    onTextInput(text) {
        var success = this.$callKeyboardHandlers(-1, text);
        if (!success) {
            this.$editor.commands.exec("insertstring", this.$editor, text);
        }
    }
}
