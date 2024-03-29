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
"use strict";

import {applyMixins} from "../lib/mix";
import HashHandler from "../keyboard/HashHandler";
import EventEmitterClass from "../lib/EventEmitterClass";
import Command from './Command';
import Editor from '../Editor';
import EventBus from '../EventBus';

/**
 * @class CommandManager
 */
export default class CommandManager implements EventBus<CommandManager>, HashHandler {
    // We actually contain a HashHandler but implement it like an interface.
    private hashHandler: HashHandler;
    private $inReplay: boolean;
    private recording: boolean;
    private macro: any[][];
    private oldMacro;
    private $addCommandToMacro: (event, cm: CommandManager) => any;
    private eventBus: EventEmitterClass<CommandManager>;
    _buildKeyHash

    /**
     * @class CommandManager
     * @constructor
     * @param platform {string} Identifier for the platform; must be either `'mac'` or `'win'`
     * @param commands {Command[]} A list of commands
     */
    constructor(platform: string, commands: Command[]) {
        this.eventBus = new EventEmitterClass<CommandManager>(this);
        this.hashHandler = new HashHandler(commands, platform)
        this.eventBus.setDefaultHandler("exec", function(e: { command: Command; editor: Editor; args }) {
            return e.command.exec(e.editor, e.args || {});
        });
    }

    get platform(): string {
        return this.hashHandler.platform;
    }

    get commands() {
        return this.hashHandler.commands;
    }

    get commandKeyBinding() {
        return this.hashHandler.commandKeyBinding;
    }

    bindKey(key: string, command: any) {
        return this.hashHandler.bindKey(key, command);
    }

    bindKeys(keyList) {
        return this.hashHandler.bindKeys(keyList);
    }

    addCommand(command: Command): void {
        this.hashHandler.addCommand(command);
    }

    removeCommand(commandName: string): void {
        this.hashHandler.removeCommand(commandName);
    }

    findKeyCommand(hashId: number, keyString: string): Command {
        return this.hashHandler.findKeyCommand(hashId, keyString);
    }

    parseKeys(keys: string) {
        return this.hashHandler.parseKeys(keys);
    }

    addCommands(commands): void {
        this.hashHandler.addCommands(commands);
    }

    removeCommands(commands): void {
        this.hashHandler.removeCommands(commands);
    }

    handleKeyboard(data, hashId: number, keyString: string, keyCode) {
        return this.hashHandler.handleKeyboard(data, hashId, keyString, keyCode);
    }

    exec(command: any, editor?: Editor, args?): boolean {
        if (typeof command === 'string') {
            command = this.hashHandler.commands[command];
        }

        if (!command) {
            return false;
        }

        if (editor && editor.$readOnly && !command.readOnly) {
            return false;
        }

        var e = { editor: editor, command: command, args: args };
        /**
         * @event exec
         */
        var retvalue = this.eventBus._emit("exec", e);
        /**
         * @event afterExec
         */
        this.eventBus._signal("afterExec", e);

        return retvalue === false ? false : true;
    }

    toggleRecording(editor: Editor): boolean {
        if (this.$inReplay)
            return;

        editor && editor._emit("changeStatus");
        if (this.recording) {
            this.macro.pop();
            this.eventBus.off("exec", this.$addCommandToMacro);

            if (!this.macro.length)
                this.macro = this.oldMacro;

            return this.recording = false;
        }
        if (!this.$addCommandToMacro) {
            this.$addCommandToMacro = function(e) {
                this.macro.push([e.command, e.args]);
            }.bind(this);
        }

        this.oldMacro = this.macro;
        this.macro = [];
        this.eventBus.on("exec", this.$addCommandToMacro);
        return this.recording = true;
    }

    replay(editor: Editor) {
        if (this.$inReplay || !this.macro)
            return;

        if (this.recording)
            return this.toggleRecording(editor);

        try {
            this.$inReplay = true;
            this.macro.forEach(function(x) {
                if (typeof x == "string")
                    this.exec(x, editor);
                else
                    this.exec(x[0], editor, x[1]);
            }, this);
        } finally {
            this.$inReplay = false;
        }
    }

    trimMacro(m) {
        return m.map(function(x) {
            if (typeof x[0] != "string")
                x[0] = x[0].name;
            if (!x[1])
                x = x[0];
            return x;
        });
    }

    /**
     * @method on
     * @param eventName {string}
     * @param callback {(event, source: CommandManager) => any}
     * @return {void}
     */
    on(eventName: string, callback: (event: any, source: CommandManager) => any, capturing?: boolean): void {
        this.eventBus.on(eventName, callback, capturing);
    }

    /**
     * @method off
     * @param eventName {string}
     * @param callback {(event, source: CommandManager) => any}
     * @return {void}
     */
    off(eventName: string, callback: (event: any, source: CommandManager) => any): void {
        this.eventBus.off(eventName, callback);
    }
}

applyMixins(CommandManager, [HashHandler]);
