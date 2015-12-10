import Editor from '../Editor';
import Command from '../commands/Command';
export default class HashHandler {
    platform: string;
    commands: {
        [name: string]: Command;
    };
    commandKeyBinding: {
        [hashId: number]: {
            [name: string]: Command;
        };
    };
    constructor(config?: any, platform?: string);
    addCommand(command: Command): void;
    removeCommand(command: string | Command): void;
    bindKey(key: string, command: any): void;
    addCommands(commands: any): void;
    removeCommands(commands: any): void;
    bindKeys(keyList: {
        [name: string]: (editor: Editor) => void;
    }): void;
    _buildKeyHash(command: Command): void;
    parseKeys(keys: string): {
        key: string;
        hashId: number;
    };
    findKeyCommand(hashId: number, keyString: string): Command;
    handleKeyboard(dataUnused: any, hashId: number, keyString: string, keyCodeUnused?: any, e?: any): {
        command: Command;
    };
}
