"use strict";
import { FUNCTION_KEYS, KEY_MODS } from "../lib/keys";
import keyCodes from "../lib/keys";
import { isMac } from "../lib/useragent";
export default class HashHandler {
    constructor(config, platform) {
        this.platform = platform || (isMac ? "mac" : "win");
        this.commands = {};
        this.commandKeyBinding = {};
        this.addCommands(config);
    }
    addCommand(command) {
        if (this.commands[command.name]) {
            this.removeCommand(command);
        }
        this.commands[command.name] = command;
        if (command.bindKey)
            this._buildKeyHash(command);
    }
    removeCommand(command) {
        var name = (typeof command === 'string' ? command : command.name);
        command = this.commands[name];
        delete this.commands[name];
        var ckb = this.commandKeyBinding;
        for (var hashId in ckb) {
            for (var key in ckb[hashId]) {
                if (ckb[hashId][key] == command)
                    delete ckb[hashId][key];
            }
        }
    }
    bindKey(key, command) {
        var self = this;
        if (!key)
            return;
        if (typeof command === "function") {
            this.addCommand({ exec: command, bindKey: key, name: command.name || key });
            return;
        }
        var ckb = this.commandKeyBinding;
        key.split("|").forEach(function (keyPart) {
            var binding = self.parseKeys(keyPart);
            var hashId = binding.hashId;
            (ckb[hashId] || (ckb[hashId] = {}))[binding.key] = command;
        }, self);
    }
    addCommands(commands) {
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
    }
    removeCommands(commands) {
        Object.keys(commands).forEach(function (name) {
            this.removeCommand(commands[name]);
        }, this);
    }
    bindKeys(keyList) {
        var self = this;
        Object.keys(keyList).forEach(function (key) {
            self.bindKey(key, keyList[key]);
        }, self);
    }
    _buildKeyHash(command) {
        var binding = command.bindKey;
        if (!binding)
            return;
        var key = typeof binding == "string" ? binding : binding[this.platform];
        this.bindKey(key, command);
    }
    parseKeys(keys) {
        if (keys.indexOf(" ") != -1)
            keys = keys.split(/\s+/).pop();
        var parts = keys.toLowerCase().split(/[\-\+]([\-\+])?/).filter(function (x) { return x; });
        var key = parts.pop();
        var keyCode = keyCodes[key];
        if (FUNCTION_KEYS[keyCode])
            key = FUNCTION_KEYS[keyCode].toLowerCase();
        else if (!parts.length)
            return { key: key, hashId: -1 };
        else if (parts.length == 1 && parts[0] == "shift")
            return { key: key.toUpperCase(), hashId: -1 };
        var hashId = 0;
        for (var i = parts.length; i--;) {
            var modifier = KEY_MODS[parts[i]];
            if (modifier === null) {
                throw new Error("invalid modifier " + parts[i] + " in " + keys);
            }
            hashId |= modifier;
        }
        return { key: key, hashId: hashId };
    }
    findKeyCommand(hashId, keyString) {
        var ckbr = this.commandKeyBinding;
        return ckbr[hashId] && ckbr[hashId][keyString];
    }
    handleKeyboard(dataUnused, hashId, keyString, keyCodeUnused, e) {
        var response = {
            command: this.findKeyCommand(hashId, keyString)
        };
        return response;
    }
}
