/* */
//import * as ts from 'typescript';
import DefaultCompilerHost from './DefaultCompilerHost';
import Logger from './logger';
import {isJavaScript, isSourceMap} from "./utils";

let logger = new Logger({ debug: false });

interface TranspileResult {
    failure: boolean;
    errors: Array<ts.Diagnostic>;
    js: string;
    sourceMap: string;
}

/**
 * @class Transpiler
 */
export default class Transpiler {
    private _host: DefaultCompilerHost;
    private _options: ts.CompilerOptions;

    /**
     * @class Transpiler
     * @constructor
     * @param host {DefaultCompilerHost}
     */
    constructor(host: DefaultCompilerHost) {
        this._host = host;

        this._options = (<any>ts).clone(this._host.options);

        if (this._options.sourceMap === undefined)
            this._options.sourceMap = this._options.inlineSourceMap;

        if (this._options.sourceMap === undefined)
            this._options.sourceMap = true;

        this._options.inlineSourceMap = false;
        this._options.declaration = false;
        this._options.isolatedModules = true;
        this._options.module = ts.ModuleKind.System;
    }

    /**
     * @method transpile
     * @param sourceName {string}
     * @param source {string}
     * @return {TranspileResult}
     */
    public transpile(sourceName: string, source: string): TranspileResult {
        logger.debug(`transpiling ${sourceName}`);

        let sourceFile = this._host.addFile(sourceName, source);
        let program = ts.createProgram([sourceName], this._options, this._host);

        let jstext: string = undefined;
        let maptext: string = undefined;

        // Emit
        let emitResult = program.emit(undefined, (outputName, output) => {
            if (isJavaScript(outputName))
                jstext = output.slice(0, output.lastIndexOf("//#")); // remove sourceMappingURL
            else if (isSourceMap(outputName))
                maptext = output;
            else
                throw new Error(`unexpected ouput file ${outputName}`)
        });

        let diagnostics: ts.Diagnostic[] = program.getSyntacticDiagnostics().concat(emitResult.diagnostics);

        return {
            failure: this.hasError(diagnostics),
            errors: diagnostics,
            js: jstext,
            sourceMap: maptext
        }
    }

    private hasError(diags: Array<ts.Diagnostic>): boolean {
        return diags.some(diag => (diag.category === ts.DiagnosticCategory.Error))
    }
}
