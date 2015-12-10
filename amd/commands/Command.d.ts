interface Command {
    name: string;
    exec: (editor, args?) => void;
    bindKey?: any;
    aceCommandGroup?: string;
    multiSelectAction?: any;
    passEvent?: boolean;
    readOnly?: boolean;
    scrollIntoView?: string;
}
export default Command;
