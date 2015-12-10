import Behaviour from "../Behaviour";
export default class CstyleBehaviour extends Behaviour {
    constructor();
    static isSaneInsertion(editor: any, session: any): boolean;
    static $matchTokenType(token: any, types: any): boolean;
    static recordAutoInsert(editor: any, session: any, bracket: any): void;
    static recordMaybeInsert(editor: any, session: any, bracket: any): void;
    static isAutoInsertedClosing(cursor: any, line: any, bracket: any): boolean;
    static isMaybeInsertedClosing(cursor: any, line: any): boolean;
    static popAutoInsertedClosing(): void;
    static clearMaybeInsertedClosing(): void;
}
