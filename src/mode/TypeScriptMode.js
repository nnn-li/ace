"use strict";
import JavaScriptMode from "./JavaScriptMode";
import TypeScriptHighlightRules from "./TypeScriptHighlightRules";
import CstyleBehaviour from "./behaviour/CstyleBehaviour";
import CStyleFoldMode from "./folding/CstyleFoldMode";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
export default class TypeScriptMode extends JavaScriptMode {
    constructor(workerUrl, scriptImports) {
        super(workerUrl, scriptImports);
        this.$id = "ace/mode/typescript";
        this.HighlightRules = TypeScriptHighlightRules;
        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CstyleBehaviour();
        this.foldingRules = new CStyleFoldMode();
    }
    createWorker(session) {
        var workerUrl = this.workerUrl;
        var scriptImports = this.scriptImports;
        return new Promise(function (resolve, reject) {
            var worker = new WorkerClient(workerUrl);
            worker.on("initAfter", function (event) {
                worker.attachToDocument(session.getDocument());
                resolve(worker);
            });
            worker.on("initFail", function (message) {
                reject(new Error(`${message}`));
            });
            worker.on("terminate", function () {
                worker.detachFromDocument();
                session.clearAnnotations();
            });
            worker.on("compileErrors", function (event) {
                session.setAnnotations(event.data);
                session._emit("compileErrors", { data: event.data });
            });
            worker.on("compiled", function (event) {
                session._emit("compiled", { data: event.data });
            });
            worker.on("getFileNames", function (event) {
                session._emit("getFileNames", { data: event.data });
            });
            worker.init(scriptImports, 'ace-workers.js', 'TypeScriptWorker');
        });
    }
    ;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHlwZVNjcmlwdE1vZGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJUeXBlU2NyaXB0TW9kZS50cyJdLCJuYW1lcyI6WyJUeXBlU2NyaXB0TW9kZSIsIlR5cGVTY3JpcHRNb2RlLmNvbnN0cnVjdG9yIiwiVHlwZVNjcmlwdE1vZGUuY3JlYXRlV29ya2VyIl0sIm1hcHBpbmdzIjoiQUFvREEsWUFBWSxDQUFDO09BRU4sY0FBYyxNQUFNLGtCQUFrQjtPQUN0Qyx3QkFBd0IsTUFBTSw0QkFBNEI7T0FDMUQsZUFBZSxNQUFNLDZCQUE2QjtPQUNsRCxjQUFjLE1BQU0sMEJBQTBCO09BQzlDLG9CQUFvQixNQUFNLHdCQUF3QjtPQUNsRCxZQUFZLE1BQU0sd0JBQXdCO0FBT2pELDRDQUE0QyxjQUFjO0lBVXREQSxZQUFZQSxTQUFpQkEsRUFBRUEsYUFBdUJBO1FBQ2xEQyxNQUFNQSxTQUFTQSxFQUFFQSxhQUFhQSxDQUFDQSxDQUFDQTtRQVRwQ0EsUUFBR0EsR0FBR0EscUJBQXFCQSxDQUFDQTtRQVV4QkEsSUFBSUEsQ0FBQ0EsY0FBY0EsR0FBR0Esd0JBQXdCQSxDQUFDQTtRQUUvQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsb0JBQW9CQSxFQUFFQSxDQUFDQTtRQUMzQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDeENBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLGNBQWNBLEVBQUVBLENBQUNBO0lBQzdDQSxDQUFDQTtJQUVERCxZQUFZQSxDQUFDQSxPQUFvQkE7UUFFN0JFLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQy9CQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQTtRQUV2Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBZUEsVUFBU0EsT0FBT0EsRUFBRUEsTUFBTUE7WUFDckQsSUFBSSxNQUFNLEdBQUcsSUFBSSxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFekMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBUyxLQUFLO2dCQUNqQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQy9DLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwQixDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLFVBQVMsT0FBTztnQkFDbEMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLEdBQUcsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ25CLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUM1QixPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMvQixDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLFVBQVMsS0FBSztnQkFDckMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ25DLE9BQU8sQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsVUFBUyxLQUFLO2dCQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLFVBQVMsS0FBSztnQkFDcEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDeEQsQ0FBQyxDQUFDLENBQUM7WUFHSCxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JFLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7O0FBQ0xGLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IEphdmFTY3JpcHRNb2RlIGZyb20gXCIuL0phdmFTY3JpcHRNb2RlXCI7XG5pbXBvcnQgVHlwZVNjcmlwdEhpZ2hsaWdodFJ1bGVzIGZyb20gXCIuL1R5cGVTY3JpcHRIaWdobGlnaHRSdWxlc1wiO1xuaW1wb3J0IENzdHlsZUJlaGF2aW91ciBmcm9tIFwiLi9iZWhhdmlvdXIvQ3N0eWxlQmVoYXZpb3VyXCI7XG5pbXBvcnQgQ1N0eWxlRm9sZE1vZGUgZnJvbSBcIi4vZm9sZGluZy9Dc3R5bGVGb2xkTW9kZVwiO1xuaW1wb3J0IE1hdGNoaW5nQnJhY2VPdXRkZW50IGZyb20gXCIuL01hdGNoaW5nQnJhY2VPdXRkZW50XCI7XG5pbXBvcnQgV29ya2VyQ2xpZW50IGZyb20gXCIuLi93b3JrZXIvV29ya2VyQ2xpZW50XCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSBcIi4uL0VkaXRTZXNzaW9uXCI7XG5cbi8qKlxuICogQGNsYXNzIFR5cGVTY3JpcHRNb2RlXG4gKiBAZXh0ZW5kcyBKYXZhU2NyaXB0TW9kZVxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUeXBlU2NyaXB0TW9kZSBleHRlbmRzIEphdmFTY3JpcHRNb2RlIHtcblxuICAgICRpZCA9IFwiYWNlL21vZGUvdHlwZXNjcmlwdFwiO1xuXG4gICAgLyoqXG4gICAgICogQGNsYXNzIFR5cGVTY3JpcHRNb2RlXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHdvcmtlclVybCB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBzY3JpcHRJbXBvcnRzIHtzcmluZ1tdfVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHdvcmtlclVybDogc3RyaW5nLCBzY3JpcHRJbXBvcnRzOiBzdHJpbmdbXSkge1xuICAgICAgICBzdXBlcih3b3JrZXJVcmwsIHNjcmlwdEltcG9ydHMpO1xuICAgICAgICB0aGlzLkhpZ2hsaWdodFJ1bGVzID0gVHlwZVNjcmlwdEhpZ2hsaWdodFJ1bGVzO1xuXG4gICAgICAgIHRoaXMuJG91dGRlbnQgPSBuZXcgTWF0Y2hpbmdCcmFjZU91dGRlbnQoKTtcbiAgICAgICAgdGhpcy4kYmVoYXZpb3VyID0gbmV3IENzdHlsZUJlaGF2aW91cigpO1xuICAgICAgICB0aGlzLmZvbGRpbmdSdWxlcyA9IG5ldyBDU3R5bGVGb2xkTW9kZSgpO1xuICAgIH1cblxuICAgIGNyZWF0ZVdvcmtlcihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IFByb21pc2U8V29ya2VyQ2xpZW50PiB7XG5cbiAgICAgICAgdmFyIHdvcmtlclVybCA9IHRoaXMud29ya2VyVXJsO1xuICAgICAgICB2YXIgc2NyaXB0SW1wb3J0cyA9IHRoaXMuc2NyaXB0SW1wb3J0cztcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8V29ya2VyQ2xpZW50PihmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIHZhciB3b3JrZXIgPSBuZXcgV29ya2VyQ2xpZW50KHdvcmtlclVybCk7XG5cbiAgICAgICAgICAgIHdvcmtlci5vbihcImluaXRBZnRlclwiLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgICAgIHdvcmtlci5hdHRhY2hUb0RvY3VtZW50KHNlc3Npb24uZ2V0RG9jdW1lbnQoKSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh3b3JrZXIpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHdvcmtlci5vbihcImluaXRGYWlsXCIsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGAke21lc3NhZ2V9YCkpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHdvcmtlci5vbihcInRlcm1pbmF0ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB3b3JrZXIuZGV0YWNoRnJvbURvY3VtZW50KCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5jbGVhckFubm90YXRpb25zKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgd29ya2VyLm9uKFwiY29tcGlsZUVycm9yc1wiLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24uc2V0QW5ub3RhdGlvbnMoZXZlbnQuZGF0YSk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5fZW1pdChcImNvbXBpbGVFcnJvcnNcIiwgeyBkYXRhOiBldmVudC5kYXRhIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHdvcmtlci5vbihcImNvbXBpbGVkXCIsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5fZW1pdChcImNvbXBpbGVkXCIsIHsgZGF0YTogZXZlbnQuZGF0YSB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB3b3JrZXIub24oXCJnZXRGaWxlTmFtZXNcIiwgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLl9lbWl0KFwiZ2V0RmlsZU5hbWVzXCIsIHsgZGF0YTogZXZlbnQuZGF0YSB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBGSVhNRTogTXVzdCBiZSBhYmxlIHRvIGluamVjdCB0aGUgbW9kdWxlIG5hbWUuXG4gICAgICAgICAgICB3b3JrZXIuaW5pdChzY3JpcHRJbXBvcnRzLCAnYWNlLXdvcmtlcnMuanMnLCAnVHlwZVNjcmlwdFdvcmtlcicpO1xuICAgICAgICB9KTtcbiAgICB9O1xufVxuIl19