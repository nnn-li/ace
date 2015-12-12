/**
 * A workspace is a collection of source files identified by name.
 */
export interface Workspace {

    /**
     * Insert or update a script.
     * This is typically called by the editing application.
     */
    ensureScript(fileName: string, content: string): void;

    /**
     * Notify the workspace of an edit to a script.
     */
    editScript(fileName: string, minChar: number, limChar: number, newText: string): void;

    /**
     * Remove a script.
     * This is typically called by the editing application.
     */
    removeScript(fileName: string): void;

    /**
     *
     */
    getFileNames(callback): void;

    /**
     *
     */
    getSyntaxErrors(fileName: string, callback: (err, results) => void): void;

    /**
     *
     */
    getSemanticErrors(fileName: string, callback: (err, results) => void): void;

    /**
     *
     */
    getCompletionsAtPosition(fileName: string, position: number, memberMode: boolean, callback: (err, results) => void): void;

    /**
     *
     */
    getTypeAtDocumentPosition(fileName: string, documentPosition: { row: number; column: number }, callback: (err, typeInfo: ts.Type) => void): void;

    /**
     *
     */
    getOutputFiles(fileName: string, callback: (err, results) => void): void;
}

export default Workspace;
