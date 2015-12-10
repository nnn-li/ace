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
define(["require", "exports", "../lib/keys", "../lib/keys", "../lib/useragent"], function (require, exports, keys_1, keys_2, useragent_1) {
    var HashHandler = (function () {
        function HashHandler(config, platform) {
            this.platform = platform || (useragent_1.isMac ? "mac" : "win");
            this.commands = {};
            this.commandKeyBinding = {};
            this.addCommands(config);
        }
        HashHandler.prototype.addCommand = function (command) {
            if (this.commands[command.name]) {
                this.removeCommand(command);
            }
            this.commands[command.name] = command;
            if (command.bindKey)
                this._buildKeyHash(command);
        };
        HashHandler.prototype.removeCommand = function (command) {
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
        };
        HashHandler.prototype.bindKey = function (key, command) {
            var self = this;
            if (!key)
                return;
            if (typeof command === "function") {
                this.addCommand({ exec: command, bindKey: key, name: command.name || key });
                return;
            }
            var ckb = this.commandKeyBinding;
            key.split("|").forEach(function (keyPart) {
                var binding = self.parseKeys(keyPart /*, command*/);
                var hashId = binding.hashId;
                (ckb[hashId] || (ckb[hashId] = {}))[binding.key] = command;
            }, self);
        };
        HashHandler.prototype.addCommands = function (commands) {
            commands && Object.keys(commands).forEach(function (name) {
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
        };
        HashHandler.prototype.removeCommands = function (commands) {
            Object.keys(commands).forEach(function (name) {
                this.removeCommand(commands[name]);
            }, this);
        };
        HashHandler.prototype.bindKeys = function (keyList) {
            var self = this;
            Object.keys(keyList).forEach(function (key) {
                self.bindKey(key, keyList[key]);
            }, self);
        };
        HashHandler.prototype._buildKeyHash = function (command) {
            var binding = command.bindKey;
            if (!binding)
                return;
            var key = typeof binding == "string" ? binding : binding[this.platform];
            this.bindKey(key, command);
        };
        // accepts keys in the form ctrl+Enter or ctrl-Enter
        // keys without modifiers or shift only 
        HashHandler.prototype.parseKeys = function (keys) {
            // todo support keychains 
            if (keys.indexOf(" ") != -1)
                keys = keys.split(/\s+/).pop();
            var parts = keys.toLowerCase().split(/[\-\+]([\-\+])?/).filter(function (x) { return x; });
            var key = parts.pop();
            var keyCode = keys_2.default[key];
            if (keys_1.FUNCTION_KEYS[keyCode])
                key = keys_1.FUNCTION_KEYS[keyCode].toLowerCase();
            else if (!parts.length)
                return { key: key, hashId: -1 };
            else if (parts.length == 1 && parts[0] == "shift")
                return { key: key.toUpperCase(), hashId: -1 };
            var hashId = 0;
            for (var i = parts.length; i--;) {
                var modifier = keys_1.KEY_MODS[parts[i]];
                if (modifier === null) {
                    throw new Error("invalid modifier " + parts[i] + " in " + keys);
                }
                hashId |= modifier;
            }
            return { key: key, hashId: hashId };
        };
        HashHandler.prototype.findKeyCommand = function (hashId, keyString) {
            var ckbr = this.commandKeyBinding;
            return ckbr[hashId] && ckbr[hashId][keyString];
        };
        HashHandler.prototype.handleKeyboard = function (dataUnused, hashId, keyString, keyCodeUnused, e) {
            var response = {
                command: this.findKeyCommand(hashId, keyString)
            };
            return response;
        };
        return HashHandler;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HashHandler;
});
