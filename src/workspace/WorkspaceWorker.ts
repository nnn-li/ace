/**
 * WorkspaceWorker
 */
import {EVENT_NAME_COMPLETIONS} from './workspace_protocol';
import IWorkerCallback from "../IWorkerCallback";
import ScriptCache from "./ScriptCache";
// FIXME: Make this an implementation detail.
import ScriptInfo from "./ScriptInfo";

/**
 * WorkspaceWorker is responsible for maintaining the language service host and language service.
 *
 * @class WorkspaceWorker
 */
export default class WorkspaceWorker {

  /**
   * @property host
   * @type ScriptCache
   * @private
   */
  private host: ScriptCache;

  /**
   * @property ls
   * @type LanguageService
   * @private
   */
  private ls: ts.LanguageService;

  /**
   * 1. Create a ScriptCache that will mirror what is in the main thread.
   *    This cache also supports the require LanguageServiceHost interface.
   *
   * 2. Create a LanguageService that uses the ScriptCache.
   *
   * 3. Register for events that either:
   *    a) provide the ScriptCache with updates in the form of deltas or new files.
   *    b) request information back from the LanguageService.
   *
   * 4. Send an 'initAfter' notification that we have completed our initialization.
   * @class WorkspaceWorker
   * @constructor
   * @param sender {IWorkerCallback}
   */
  constructor(sender: IWorkerCallback) {

    this.host = new ScriptCache();
    this.ls = ts.createLanguageService(this.host);

    var self = this;

    sender.on('ensureScript', function(message: { data: { fileName: string; content: string } }) {
      // This call, in turn will add the library to the lsHost.
      self.ensureScript(message.data.fileName, message.data.content);
    });

    sender.on('editScript', function(message: { data: { fileName: string; start: number; end: number; text: string } }) {
      var data = message.data;
      var fileName = data.fileName;
      var start = data.start;
      var end = data.end;
      var text = data.text;
      self.editScript(fileName, start, end, text);
    });

    sender.on('removeScript', function(message: { data: { fileName: string; content: string } }) {
      self.removeScript(message.data.fileName);
    });

    sender.on('getFileNames', function(request: { data: { callbackId: number } }) {
      var data = request.data;
      var callbackId: number = data.callbackId;
      var names = self.host.getScriptFileNames();
      var response = { names: names, callbackId: callbackId };
      sender.emit("fileNames", response);
    });

    sender.on('getSyntaxErrors', function(request: { data: { fileName: string; callbackId: number } }) {
      var data = request.data;
      var fileName: string = data.fileName;
      var callbackId: number = data.callbackId;
      // TODO: More information available in diagnostic.
      var errors = self.ls.getSyntacticDiagnostics(fileName).map((error: ts.Diagnostic) => { return { message: error.messageText, start: error.start, length: error.length }; });
      var response = { errors: errors, callbackId: callbackId };
      sender.emit("syntaxErrors", response);
    });

    sender.on('getSemanticErrors', function(request: { data: { fileName: string; callbackId: number } }) {
      var data = request.data;
      var fileName: string = data.fileName;
      var callbackId: number = data.callbackId;
      try {
        var errors = self.ls.getSemanticDiagnostics(fileName).map((error: ts.Diagnostic) => { return { message: error.messageText, start: error.start, length: error.length }; });
        var response = { errors: errors, callbackId: callbackId };
        sender.emit("semanticErrors", response);
      }
      catch (e) {
      }
    });

    sender.on('getCompletionsAtPosition', function(request: { data: { fileName: string; position: number; memberMode: boolean; callbackId: number } }) {
      try {
        var data = request.data;
        var fileName: string = data.fileName;
        var position: number = data.position;
        var memberMode: boolean = data.memberMode;
        var callbackId: number = data.callbackId;
        if (typeof position !== 'number' || isNaN(position)) {
          throw new Error("position must be a number and not NaN");
        }
        var completions: ts.CompletionInfo = self.ls.getCompletionsAtPosition(fileName, position);
        sender.emit(EVENT_NAME_COMPLETIONS, { completions: completions, callbackId: callbackId });
      }
      catch (e) {
        // e parameter cannot have a type annotation so we really have to do some introspection.
        // FIXME: It would be nice to ensure a {name, message} structure.
        sender.emit(EVENT_NAME_COMPLETIONS, { err: e.toString(), callbackId: callbackId });
      }
    });

    // FIXME: Name change
    sender.on('getTypeAtDocumentPosition', function(request: { data: { fileName: string; documentPosition: { row: number; column: number }; callbackId: number } }) {
      try {
        var data = request.data;
        var fileName: string = data.fileName;
        var documentPosition: { row: number; column: number } = data.documentPosition;
        var callbackId: number = data.callbackId;
        var script: ScriptInfo = self.host.scripts[fileName];
        var row = documentPosition.row;
        var column = documentPosition.column;
        var position = script.getLineMap().getPosition(row, column);
        var typeInfo: ts.DefinitionInfo[] = self.ls.getTypeDefinitionAtPosition(fileName, position);
        // TODO: Why do we now have an array?
        if (typeInfo) {
          var description = null;
          var memberName;// = typeInfo.memberName;
          if (memberName) {
            // TODO: This API call has several options. Maybe need to query?
            //description = TypeScript.MemberName.memberNameToString(memberName);
          }
          var kind;// = typeInfo.kind;
          var minChar;// = typeInfo.minChar;
          var limChar;// = typeInfo.limChar;
          var docComment;// = typeInfo.docComment;
          var fullSymbolName;// = typeInfo.fullSymbolName;

          var results = { kind: kind, minChar: minChar, limChar: limChar, description: description, docComment: docComment, fullSymbolName: fullSymbolName };
          var response = { results: results, callbackId: callbackId };
          sender.emit("typeAtDocumentPosition", response);
        }
        else {
          // We should call back, if only to allow the receiver to cleanup quickly.
          sender.emit("typeAtDocumentPosition", { callbackId: callbackId });
        }
      }
      catch (e) {
        sender.emit("typeAtDocumentPosition", { err: "" + e, callbackId: callbackId });
      }
    });

    sender.on('getOutputFiles', function(request: { data: { fileName: string; callbackId: number } }) {
      var data = request.data;
      var fileName: string = data.fileName;
      var callbackId: number = data.callbackId;
      try {
        var emitOutput: ts.EmitOutput = self.ls.getEmitOutput(fileName);
        var outputFiles: ts.OutputFile[] = emitOutput.outputFiles;
        var response = { results: outputFiles, callbackId: callbackId };
        sender.emit("outputFiles", response);
      }
      catch (e) {
      }
    });

    sender.emit('initAfter');
  }

  /**
   * @method ensureScript
   * @param fileName {string}
   * @param content {string}
   * @return {void}
   * @private
   */
  private ensureScript(fileName: string, content: string): void {
    this.host.ensureScript(fileName, content);
  }

  private editScript(fileName: string, start: number, end: number, text: string): void {
    this.host.editScript(fileName, start, end, text);
  }

  private removeScript(fileName: string): void {
    this.host.removeScript(fileName);
  }
}