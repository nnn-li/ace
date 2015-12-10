import HashHandler from "../keyboard/HashHandler";
import EventEmitterClass from "../lib/event_emitter";
import Command from './Command';
import Editor from '../Editor';
export default class CommandManager extends EventEmitterClass implements HashHandler {
    private hashHandler;
    private $inReplay;
    private recording;
    private macro;
    private oldMacro;
    private $addCommandToMacro;
    _buildKeyHash: any;
    /**
     * @param {string} platform Identifier for the platform; must be either `'mac'` or `'win'`
     * @param {Array} commands A list of commands
     */
    constructor(platform: string, commands: Command[]);
    platform: string;
    commands: {
        [name: string]: Command;
    };
    commandKeyBinding: {
        [hashId: number]: {
            [name: string]: Command;
        };
    };
    bindKey(key: string, command: any): void;
    bindKeys(keyList: any): void;
    addCommand(command: Command): void;
    removeCommand(commandName: string): void;
    findKeyCommand(hashId: number, keyString: string): Command;
    parseKeys(keys: string): {
        key: string;
        hashId: number;
    };
    addCommands(commands: any): void;
    removeCommands(commands: any): void;
    handleKeyboard(data: any, hashId: number, keyString: string, keyCode: any): {
        command: Command;
    };
    exec(command: any, editor?: Editor, args?: any): boolean;
    toggleRecording(editor: Editor): boolean;
    replay(editor: Editor): boolean;
    trimMacro(m: any): any;
}
