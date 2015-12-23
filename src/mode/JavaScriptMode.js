"use strict";
import TextMode from "./TextMode";
import JavaScriptHighlightRules from "./JavaScriptHighlightRules";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
import CstyleBehaviour from "./behaviour/CstyleBehaviour";
import CStyleFoldMode from "./folding/CstyleFoldMode";
export default class JavaScriptMode extends TextMode {
    constructor(workerUrl, scriptImports) {
        super(workerUrl, scriptImports);
        this.HighlightRules = JavaScriptHighlightRules;
        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CstyleBehaviour();
        this.foldingRules = new CStyleFoldMode();
        this.lineCommentStart = "//";
        this.blockComment = { start: "/*", end: "*/" };
        this.$id = "ace/mode/javascript";
    }
    getNextLineIndent(state, line, tab) {
        var indent = this.$getIndent(line);
        var tokenizedLine = this.getTokenizer().getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;
        if (tokens.length && tokens[tokens.length - 1].type == "comment") {
            return indent;
        }
        if (state === "start" || state === "no_regex") {
            var match = line.match(/^.*(?:\bcase\b.*\:|[\{\(\[])\s*$/);
            if (match) {
                indent += tab;
            }
        }
        else if (state === "doc-start") {
            if (endState == "start" || endState == "no_regex") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
        }
        return indent;
    }
    checkOutdent(state, line, text) {
        return this.$outdent.checkOutdent(line, text);
    }
    ;
    autoOutdent(state, session, row) {
        return this.$outdent.autoOutdent(session, row);
    }
    ;
    createWorker(session) {
        var workerUrl = this.workerUrl;
        var scriptImports = this.scriptImports;
        return new Promise(function (success, fail) {
            var worker = new WorkerClient(workerUrl);
            worker.on("initAfter", function () {
                worker.attachToDocument(session.getDocument());
                success(worker);
            });
            worker.on("errors", function (errors) {
                session.setAnnotations(errors.data);
            });
            worker.on("terminate", function () {
                worker.detachFromDocument();
                session.clearAnnotations();
            });
            worker.init(scriptImports, 'ace-workers', 'JavaScriptWorker');
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSmF2YVNjcmlwdE1vZGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJKYXZhU2NyaXB0TW9kZS50cyJdLCJuYW1lcyI6WyJKYXZhU2NyaXB0TW9kZSIsIkphdmFTY3JpcHRNb2RlLmNvbnN0cnVjdG9yIiwiSmF2YVNjcmlwdE1vZGUuZ2V0TmV4dExpbmVJbmRlbnQiLCJKYXZhU2NyaXB0TW9kZS5jaGVja091dGRlbnQiLCJKYXZhU2NyaXB0TW9kZS5hdXRvT3V0ZGVudCIsIkphdmFTY3JpcHRNb2RlLmNyZWF0ZVdvcmtlciJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUlOLFFBQVEsTUFBTSxZQUFZO09BQzFCLHdCQUF3QixNQUFNLDRCQUE0QjtPQUMxRCxvQkFBb0IsTUFBTSx3QkFBd0I7T0FFbEQsWUFBWSxNQUFNLHdCQUF3QjtPQUMxQyxlQUFlLE1BQU0sNkJBQTZCO09BQ2xELGNBQWMsTUFBTSwwQkFBMEI7QUFPckQsNENBQTRDLFFBQVE7SUFVaERBLFlBQVlBLFNBQWlCQSxFQUFFQSxhQUF1QkE7UUFDbERDLE1BQU1BLFNBQVNBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1FBRWhDQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSx3QkFBd0JBLENBQUNBO1FBRS9DQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxvQkFBb0JBLEVBQUVBLENBQUNBO1FBQzNDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxlQUFlQSxFQUFFQSxDQUFDQTtRQUN4Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsSUFBSUEsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFDekNBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBO1FBRS9DQSxJQUFJQSxDQUFDQSxHQUFH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SUFBSSxNQUFNLEdBQUcsSUFBSSxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFekMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ25CLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztnQkFDL0MsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BCLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsVUFBUyxNQUE4QjtnQkFDdkQsT0FBTyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDbkIsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQzVCLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQy9CLENBQUMsQ0FBQyxDQUFDO1lBR0gsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDbEUsQ0FBQyxDQUFDQSxDQUFBQTtJQUNOQSxDQUFDQTtBQUNMTCxDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTYgRGF2aWQgR2VvIEhvbG1lcyA8ZGF2aWQuZ2VvLmhvbG1lc0BnbWFpbC5jb20+XG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQge2luaGVyaXRzfSBmcm9tIFwiLi4vbGliL29vcFwiO1xuaW1wb3J0IEFubm90YXRpb24gZnJvbSBcIi4uL0Fubm90YXRpb25cIjtcbmltcG9ydCBUZXh0TW9kZSBmcm9tIFwiLi9UZXh0TW9kZVwiO1xuaW1wb3J0IEphdmFTY3JpcHRIaWdobGlnaHRSdWxlcyBmcm9tIFwiLi9KYXZhU2NyaXB0SGlnaGxpZ2h0UnVsZXNcIjtcbmltcG9ydCBNYXRjaGluZ0JyYWNlT3V0ZGVudCBmcm9tIFwiLi9NYXRjaGluZ0JyYWNlT3V0ZGVudFwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuLi9SYW5nZVwiO1xuaW1wb3J0IFdvcmtlckNsaWVudCBmcm9tIFwiLi4vd29ya2VyL1dvcmtlckNsaWVudFwiO1xuaW1wb3J0IENzdHlsZUJlaGF2aW91ciBmcm9tIFwiLi9iZWhhdmlvdXIvQ3N0eWxlQmVoYXZpb3VyXCI7XG5pbXBvcnQgQ1N0eWxlRm9sZE1vZGUgZnJvbSBcIi4vZm9sZGluZy9Dc3R5bGVGb2xkTW9kZVwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gXCIuLi9FZGl0U2Vzc2lvblwiO1xuXG4vKipcbiAqIEBjbGFzcyBKYXZhU2NyaXB0TW9kZVxuICogQGV4dGVuZHMgVGV4dE1vZGVcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSmF2YVNjcmlwdE1vZGUgZXh0ZW5kcyBUZXh0TW9kZSB7XG4gICAgJG91dGRlbnQ6IE1hdGNoaW5nQnJhY2VPdXRkZW50O1xuICAgIGJsb2NrQ29tbWVudDogeyBzdGFydDogc3RyaW5nOyBlbmQ6IHN0cmluZyB9O1xuXG4gICAgLyoqXG4gICAgICogQGNsYXNzIEphdmFTY3JpcHRNb2RlXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHdvcmtlclVybCB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBzY3JpcHRJbXBvcnRzOiB7c3RyaW5nW119XG4gICAgICovXG4gICAgY29uc3RydWN0b3Iod29ya2VyVXJsOiBzdHJpbmcsIHNjcmlwdEltcG9ydHM6IHN0cmluZ1tdKSB7XG4gICAgICAgIHN1cGVyKHdvcmtlclVybCwgc2NyaXB0SW1wb3J0cyk7XG4gICAgICAgIC8vIFRoZSBUb2tlbml6ZXIgd2lsbCBiZSBidWlsdCB1c2luZyB0aGVzZSBydWxlcy5cbiAgICAgICAgdGhpcy5IaWdobGlnaHRSdWxlcyA9IEphdmFTY3JpcHRIaWdobGlnaHRSdWxlcztcblxuICAgICAgICB0aGlzLiRvdXRkZW50ID0gbmV3IE1hdGNoaW5nQnJhY2VPdXRkZW50KCk7XG4gICAgICAgIHRoaXMuJGJlaGF2aW91ciA9IG5ldyBDc3R5bGVCZWhhdmlvdXIoKTtcbiAgICAgICAgdGhpcy5mb2xkaW5nUnVsZXMgPSBuZXcgQ1N0eWxlRm9sZE1vZGUoKTtcbiAgICAgICAgdGhpcy5saW5lQ29tbWVudFN0YXJ0ID0gXCIvL1wiO1xuICAgICAgICB0aGlzLmJsb2NrQ29tbWVudCA9IHsgc3RhcnQ6IFwiLypcIiwgZW5kOiBcIiovXCIgfTtcblxuICAgICAgICB0aGlzLiRpZCA9IFwiYWNlL21vZGUvamF2YXNjcmlwdFwiO1xuICAgIH1cblxuICAgIGdldE5leHRMaW5lSW5kZW50KHN0YXRlOiBzdHJpbmcsIGxpbmU6IHN0cmluZywgdGFiOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICB2YXIgaW5kZW50ID0gdGhpcy4kZ2V0SW5kZW50KGxpbmUpO1xuXG4gICAgICAgIHZhciB0b2tlbml6ZWRMaW5lID0gdGhpcy5nZXRUb2tlbml6ZXIoKS5nZXRMaW5lVG9rZW5zKGxpbmUsIHN0YXRlKTtcbiAgICAgICAgdmFyIHRva2VucyA9IHRva2VuaXplZExpbmUudG9rZW5zO1xuICAgICAgICB2YXIgZW5kU3RhdGUgPSB0b2tlbml6ZWRMaW5lLnN0YXRlO1xuXG4gICAgICAgIGlmICh0b2tlbnMubGVuZ3RoICYmIHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udHlwZSA9PSBcImNvbW1lbnRcIikge1xuICAgICAgICAgICAgcmV0dXJuIGluZGVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZSA9PT0gXCJzdGFydFwiIHx8IHN0YXRlID09PSBcIm5vX3JlZ2V4XCIpIHtcbiAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmUubWF0Y2goL14uKig/OlxcYmNhc2VcXGIuKlxcOnxbXFx7XFwoXFxbXSlcXHMqJC8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50ICs9IHRhYjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdGF0ZSA9PT0gXCJkb2Mtc3RhcnRcIikge1xuICAgICAgICAgICAgaWYgKGVuZFN0YXRlID09IFwic3RhcnRcIiB8fCBlbmRTdGF0ZSA9PSBcIm5vX3JlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBtYXRjaCA9IGxpbmUubWF0Y2goL15cXHMqKFxcLz8pXFwqLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hbMV0pIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZW50ICs9IFwiIFwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpbmRlbnQgKz0gXCIqIFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGluZGVudDtcbiAgICB9XG5cbiAgICBjaGVja091dGRlbnQoc3RhdGU6IHN0cmluZywgbGluZTogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG91dGRlbnQuY2hlY2tPdXRkZW50KGxpbmUsIHRleHQpO1xuICAgIH07XG5cbiAgICBhdXRvT3V0ZGVudChzdGF0ZTogc3RyaW5nLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgcm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3V0ZGVudC5hdXRvT3V0ZGVudChzZXNzaW9uLCByb3cpO1xuICAgIH07XG5cbiAgICBjcmVhdGVXb3JrZXIoc2Vzc2lvbjogRWRpdFNlc3Npb24pOiBQcm9taXNlPFdvcmtlckNsaWVudD4ge1xuXG4gICAgICAgIHZhciB3b3JrZXJVcmwgPSB0aGlzLndvcmtlclVybDtcbiAgICAgICAgdmFyIHNjcmlwdEltcG9ydHMgPSB0aGlzLnNjcmlwdEltcG9ydHM7XG5cbiAgICAgICAgLy8gRklYTUU6IEhvdyBkbyB3ZSBjb21tdW5pY2F0ZSBmYWlsLlxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8V29ya2VyQ2xpZW50PihmdW5jdGlvbihzdWNjZXNzLCBmYWlsKSB7XG5cbiAgICAgICAgICAgIHZhciB3b3JrZXIgPSBuZXcgV29ya2VyQ2xpZW50KHdvcmtlclVybCk7XG5cbiAgICAgICAgICAgIHdvcmtlci5vbihcImluaXRBZnRlclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB3b3JrZXIuYXR0YWNoVG9Eb2N1bWVudChzZXNzaW9uLmdldERvY3VtZW50KCkpO1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3Mod29ya2VyKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB3b3JrZXIub24oXCJlcnJvcnNcIiwgZnVuY3Rpb24oZXJyb3JzOiB7IGRhdGE6IEFubm90YXRpb25bXSB9KSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyhlcnJvcnMuZGF0YSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgd29ya2VyLm9uKFwidGVybWluYXRlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHdvcmtlci5kZXRhY2hGcm9tRG9jdW1lbnQoKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMoKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBGSVhNRTogTXVzdCBiZSBhYmxlIHRvIGluamVjdCB0aGUgbW9kdWxlIG5hbWUuXG4gICAgICAgICAgICB3b3JrZXIuaW5pdChzY3JpcHRJbXBvcnRzLCAnYWNlLXdvcmtlcnMnLCAnSmF2YVNjcmlwdFdvcmtlcicpO1xuICAgICAgICB9KVxuICAgIH1cbn1cbiJdfQ==