var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "../lib/mix", "../keyboard/HashHandler", "../lib/event_emitter"], function (require, exports, mix_1, HashHandler_1, event_emitter_1) {
    var CommandManager = (function (_super) {
        __extends(CommandManager, _super);
        /**
         * @param {string} platform Identifier for the platform; must be either `'mac'` or `'win'`
         * @param {Array} commands A list of commands
         */
        function CommandManager(platform, commands) {
            _super.call(this);
            this.hashHandler = new HashHandler_1.default(commands, platform);
            this.setDefaultHandler("exec", function (e) {
                return e.command.exec(e.editor, e.args || {});
            });
        }
        Object.defineProperty(CommandManager.prototype, "platform", {
            get: function () {
                return this.hashHandler.platform;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(CommandManager.prototype, "commands", {
            get: function () {
                return this.hashHandler.commands;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(CommandManager.prototype, "commandKeyBinding", {
            get: function () {
                return this.hashHandler.commandKeyBinding;
            },
            enumerable: true,
            configurable: true
        });
        CommandManager.prototype.bindKey = function (key, command) {
            return this.hashHandler.bindKey(key, command);
        };
        CommandManager.prototype.bindKeys = function (keyList) {
            return this.hashHandler.bindKeys(keyList);
        };
        CommandManager.prototype.addCommand = function (command) {
            this.hashHandler.addCommand(command);
        };
        CommandManager.prototype.removeCommand = function (commandName) {
            this.hashHandler.removeCommand(commandName);
        };
        CommandManager.prototype.findKeyCommand = function (hashId, keyString) {
            return this.hashHandler.findKeyCommand(hashId, keyString);
        };
        CommandManager.prototype.parseKeys = function (keys) {
            return this.hashHandler.parseKeys(keys);
        };
        CommandManager.prototype.addCommands = function (commands) {
            this.hashHandler.addCommands(commands);
        };
        CommandManager.prototype.removeCommands = function (commands) {
            this.hashHandler.removeCommands(commands);
        };
        CommandManager.prototype.handleKeyboard = function (data, hashId, keyString, keyCode) {
            return this.hashHandler.handleKeyboard(data, hashId, keyString, keyCode);
        };
        CommandManager.prototype.exec = function (command, editor, args) {
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
            var retvalue = this._emit("exec", e);
            this._signal("afterExec", e);
            return retvalue === false ? false : true;
        };
        CommandManager.prototype.toggleRecording = function (editor) {
            if (this.$inReplay)
                return;
            editor && editor._emit("changeStatus");
            if (this.recording) {
                this.macro.pop();
                this.off("exec", this.$addCommandToMacro);
                if (!this.macro.length)
                    this.macro = this.oldMacro;
                return this.recording = false;
            }
            if (!this.$addCommandToMacro) {
                this.$addCommandToMacro = function (e) {
                    this.macro.push([e.command, e.args]);
                }.bind(this);
            }
            this.oldMacro = this.macro;
            this.macro = [];
            this.on("exec", this.$addCommandToMacro);
            return this.recording = true;
        };
        CommandManager.prototype.replay = function (editor) {
            if (this.$inReplay || !this.macro)
                return;
            if (this.recording)
                return this.toggleRecording(editor);
            try {
                this.$inReplay = true;
                this.macro.forEach(function (x) {
                    if (typeof x == "string")
                        this.exec(x, editor);
                    else
                        this.exec(x[0], editor, x[1]);
                }, this);
            }
            finally {
                this.$inReplay = false;
            }
        };
        CommandManager.prototype.trimMacro = function (m) {
            return m.map(function (x) {
                if (typeof x[0] != "string")
                    x[0] = x[0].name;
                if (!x[1])
                    x = x[0];
                return x;
            });
        };
        return CommandManager;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = CommandManager;
    mix_1.applyMixins(CommandManager, [HashHandler_1.default]);
});
