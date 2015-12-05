// import Editor = require('../Editor')

interface Command {
    name: string;
    exec: (editor/*: Editor*/, args?) => void;
    bindKey?: any/*: { win: string; mac: string }*/;
    aceCommandGroup?: string;
    multiSelectAction?: any;
    passEvent?: boolean;
    readOnly?: boolean;
    scrollIntoView?: string;
}

export = Command;