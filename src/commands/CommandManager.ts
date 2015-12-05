import mix = require("../lib/mix");
import oop = require("../lib/oop");
import hhm = require("../keyboard/hash_handler");
import eem = require("../lib/event_emitter");
import Command = require('./Command');
import Editor = require('../Editor');

class CommandManager extends eem.EventEmitterClass implements hhm.HashHandler {
    private hashHandler = new hhm.HashHandler();
    public platform;
    private byName;
    private $inReplay;
    private recording;
    private macro;
    private oldMacro;
    private $addCommandToMacro;
    _buildKeyHash

    /**
     * @param {string} platform Identifier for the platform; must be either `'mac'` or `'win'`
     * @param {Array} commands A list of commands
     */
    constructor(platform: string, commands: Command[]) {
        super();
        hhm.HashHandler.call(this, commands, platform);
        this.byName = this.hashHandler.commands;
        this.setDefaultHandler("exec", function(e: { command: Command; editor: Editor; args }) {
            return e.command.exec(e.editor, e.args || {});
        });
    }

    get commands() {
        return this.hashHandler.commands;
    }

    get commandKeyBinding() {
        return this.hashHandler.commandKeyBinding;
    }

    bindKey(key: string, command) {
        return this.hashHandler.bindKey(key, command);
    }

    bindKeys(keyList) {
        return this.hashHandler.bindKeys(keyList);
    }

    addCommand(command): void {
        this.hashHandler.addCommand(command);
    }

    removeCommand(commandName: string): void {
        this.hashHandler.removeCommand(commandName);
    }

    findKeyCommand(hashId, keyString: string) {
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

    exec(command: any, editor?: Editor, args?) {
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
    }

    toggleRecording(editor: Editor) {
        if (this.$inReplay)
            return;

        editor && editor._emit("changeStatus");
        if (this.recording) {
            this.macro.pop();
            this.removeEventListener("exec", this.$addCommandToMacro);

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
        this.on("exec", this.$addCommandToMacro);
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
}

mix.applyMixins(CommandManager, [hhm.HashHandler]);

export = CommandManager;
