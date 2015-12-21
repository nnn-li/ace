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

import {FUNCTION_KEYS, KEY_MODS} from "../lib/keys";
import keyCodes from "../lib/keys";
import {isMac} from "../lib/useragent";
import Editor from '../Editor';
import BindKeyFunction from "./BindKeyFunction";
import Command from '../commands/Command';

/**
 * @class HashHandler
 */
export default class HashHandler {
    public platform: string;
    public commands: { [name: string]: Command };
    public commandKeyBinding: { [hashId: number]: { [name: string]: Command } };
    // TODO: What do these do? See KeyBinding.
    // public attach: (editor: Editor) => any;
    // public detach: (editor: Editor) => any;

    /**
     * @class HashHandler
     * @constructor
     * @params [config]
     * @params [platform] {string}
     */
    constructor(config?, platform?: string) {

        this.platform = platform || (isMac ? "mac" : "win");
        this.commands = {};
        this.commandKeyBinding = {};

        this.addCommands(config);
    }

    /**
     * @method addCommand
     * @param command {Command}
     * @return {void}
     */
    addCommand(command: Command): void {
        if (this.commands[command.name]) {
            this.removeCommand(command);
        }

        this.commands[command.name] = command;

        if (command.bindKey)
            this._buildKeyHash(command);
    }

    /**
     * @method removeCommand
     * @param command {string | Command}
     * @return {void}
     */
    removeCommand(command: string | Command): void {
        var name = (typeof command === 'string' ? command : command.name);
        command = this.commands[name];
        delete this.commands[name];

        // exhaustive search is brute force but since removeCommand is
        // not a performance critical operation this should be OK
        var ckb = this.commandKeyBinding;
        for (var hashId in ckb) {
            for (var key in ckb[hashId]) {
                if (ckb[hashId][key] == command)
                    delete ckb[hashId][key];
            }
        }
    }

    /**
     * @method bindKey
     * @param key {string}
     * @param command
     * @return {void}
     */
    bindKey(key: string, command:/*: BindKeyFunction | Command*/any): void {
        var self = this;

        if (!key)
            return;
        if (typeof command === "function") {
            this.addCommand({ exec: command, bindKey: key, name: command.name || key });
            return;
        }

        var ckb = this.commandKeyBinding;
        key.split("|").forEach(function(keyPart) {
            var binding = self.parseKeys(keyPart/*, command*/);
            var hashId = binding.hashId;
            (ckb[hashId] || (ckb[hashId] = {}))[binding.key] = command;
        }, self);
    }

    /**
     * @method addCommands
     * @param commands
     * @return {void}
     */
    addCommands(commands: { [name: string]: any }): void {

        commands && Object.keys(commands).forEach(function(name) {

            var command = commands[name];
            if (!command) {
                return;
            }

            if (typeof command === "string") {
                return this.bindKey(command, name);
            }

            if (typeof command === "function") {
                command = { exec: command };
            }

            if (typeof command !== "object") {
                return;
            }

            if (!command.name) {
                command.name = name;
            }

            this.addCommand(command);
        }, this);
    }

    /**
     * @method removeCommands
     * @param commands
     * @return {void}
     */
    removeCommands(commands: { [name: string]: any }): void {
        Object.keys(commands).forEach(function(name) {
            this.removeCommand(commands[name]);
        }, this);
    }

    /**
     * @method bindKeys
     * @param keyList
     * @return {void}
     */
    bindKeys(keyList: { [name: string]: (editor: Editor) => void }): void {
        var self = this;
        Object.keys(keyList).forEach(function(key) {
            self.bindKey(key, keyList[key]);
        }, self);
    }

    public _buildKeyHash(command: Command): void {
        var binding = command.bindKey;
        if (!binding)
            return;

        var key = typeof binding == "string" ? binding : binding[this.platform];
        this.bindKey(key, command);
    }

    /**
     * accepts keys in the form ctrl+Enter or ctrl-Enter
     * keys without modifiers or shift only.
     *
     * @method parseKeys
     * @param keys {string}
     * @return {{key: string; hashId: number}}
     */
    parseKeys(keys: string): { key: string; hashId: number } {
        // todo support keychains 
        if (keys.indexOf(" ") != -1)
            keys = keys.split(/\s+/).pop();

        var parts = keys.toLowerCase().split(/[\-\+]([\-\+])?/).filter(function(x: any) { return x; });
        var key = parts.pop();

        var keyCode = keyCodes[key];
        if (FUNCTION_KEYS[keyCode])
            key = FUNCTION_KEYS[keyCode].toLowerCase();
        else if (!parts.length)
            return { key: key, hashId: -1 };
        else if (parts.length == 1 && parts[0] == "shift")
            return { key: key.toUpperCase(), hashId: -1 };

        var hashId: number = 0;
        for (var i = parts.length; i--;) {
            var modifier = KEY_MODS[parts[i]];
            if (modifier === null) {
                throw new Error("invalid modifier " + parts[i] + " in " + keys);
            }
            hashId |= modifier;
        }
        return { key: key, hashId: hashId };
    }

    /**
     * @method findKeyCommand
     * @param hashId {number}
     * @param keyString {string}
     * @return {Command}
     */
    findKeyCommand(hashId: number, keyString: string): Command {
        var ckbr = this.commandKeyBinding;
        return ckbr[hashId] && ckbr[hashId][keyString];
    }

    handleKeyboard(dataUnused, hashId: number, keyString: string, keyCodeUnused?, e?): { command: Command } {
        var response = {
            command: this.findKeyCommand(hashId, keyString)
        };
        return response;
    }
}
