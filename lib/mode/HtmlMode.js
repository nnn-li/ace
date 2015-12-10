import { arrayToMap } from "../lib/lang";
import TextMode from "./Mode";
import JavaScriptMode from "./JavaScriptMode";
import CssMode from "./CssMode";
import HtmlHighlightRules from "./HtmlHighlightRules";
import XmlBehaviour from "./behaviour/XmlBehaviour";
import HtmlFoldMode from "./folding/HtmlFoldMode";
import HtmlCompletions from "./HtmlCompletions";
import WorkerClient from "../worker/WorkerClient";
var voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
var optionalEndTags = ["li", "dt", "dd", "p", "rt", "rp", "optgroup", "option", "colgroup", "td", "th"];
export default class HtmlMode extends TextMode {
    constructor(options) {
        super();
        this.blockComment = { start: "<!--", end: "-->" };
        this.voidElements = arrayToMap(voidElements);
        this.$id = "ace/mode/html";
        this.fragmentContext = options && options.fragmentContext;
        this.HighlightRules = HtmlHighlightRules;
        this.$behaviour = new XmlBehaviour();
        this.$completer = new HtmlCompletions();
        this.createModeDelegates({
            "js-": JavaScriptMode,
            "css-": CssMode
        });
        this.foldingRules = new HtmlFoldMode(this.voidElements, arrayToMap(optionalEndTags));
    }
    getNextLineIndent(state, line, tab) {
        return this.$getIndent(line);
    }
    checkOutdent(state, line, text) {
        return false;
    }
    getCompletions(state, session, pos, prefix) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    }
    createWorker(session) {
        var worker = new WorkerClient("lib/worker/worker-systemjs.js");
        var mode = this;
        worker.on("initAfter", function () {
            worker.attachToDocument(session.getDocument());
            if (mode.fragmentContext) {
                worker.call("setOptions", [{ context: mode.fragmentContext }]);
            }
        });
        worker.on("error", function (e) {
            session.setAnnotations(e.data);
        });
        worker.on("terminate", function () {
            session.clearAnnotations();
        });
        worker.init("lib/mode/HtmlWorker", "default");
        return worker;
    }
    ;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSHRtbE1vZGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9kZS9IdG1sTW9kZS50cyJdLCJuYW1lcyI6WyJIdG1sTW9kZSIsIkh0bWxNb2RlLmNvbnN0cnVjdG9yIiwiSHRtbE1vZGUuZ2V0TmV4dExpbmVJbmRlbnQiLCJIdG1sTW9kZS5jaGVja091dGRlbnQiLCJIdG1sTW9kZS5nZXRDb21wbGV0aW9ucyIsIkh0bWxNb2RlLmNyZWF0ZVdvcmtlciJdLCJtYXBwaW5ncyI6Ik9BK0JPLEVBQUMsVUFBVSxFQUFDLE1BQU0sYUFBYTtPQUMvQixRQUFRLE1BQU0sUUFBUTtPQUN0QixjQUFjLE1BQU0sa0JBQWtCO09BQ3RDLE9BQU8sTUFBTSxXQUFXO09BQ3hCLGtCQUFrQixNQUFNLHNCQUFzQjtPQUM5QyxZQUFZLE1BQU0sMEJBQTBCO09BQzVDLFlBQVksTUFBTSx3QkFBd0I7T0FDMUMsZUFBZSxNQUFNLG1CQUFtQjtPQUN4QyxZQUFZLE1BQU0sd0JBQXdCO0FBSWpELElBQUksWUFBWSxHQUFHLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztBQUM3SSxJQUFJLGVBQWUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUV4RyxzQ0FBc0MsUUFBUTtJQU0xQ0EsWUFBWUEsT0FBT0E7UUFDZkMsT0FBT0EsQ0FBQ0E7UUFOWkEsaUJBQVlBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1FBQzdDQSxpQkFBWUEsR0FBR0EsVUFBVUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLFFBQUdBLEdBQUdBLGVBQWVBLENBQUNBO1FBS2xCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsY0FBY0EsR0FBR0Esa0JBQWtCQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDckNBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLGVBQWVBLEVBQUVBLENBQUNBO1FBRXhDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBO1lBQ3JCQSxLQUFLQSxFQUFFQSxjQUFjQTtZQUNyQkEsTUFBTUEsRUFBRUEsT0FBT0E7U0FDbEJBLENBQUNBLENBQUNBO1FBRUhBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLFVBQVVBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO0lBQ3pGQSxDQUFDQTtJQUVERCxpQkFBaUJBLENBQUNBLEtBQWFBLEVBQUVBLElBQVlBLEVBQUVBLEdBQVdBO1FBQ3RERSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFFREYsWUFBWUEsQ0FBQ0EsS0FBYUEsRUFBRUEsSUFBWUEsRUFBRUEsSUFBWUE7UUFDbERHLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUVESCxjQUFjQSxDQUFDQSxLQUFhQSxFQUFFQSxPQUFvQkEsRUFBRUEsR0FBb0NBLEVBQUVBLE1BQWNBO1FBQ3BHSSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxjQUFjQSxDQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUN2RUEsQ0FBQ0E7SUFFREosWUFBWUEsQ0FBQ0EsT0FBb0JBO1FBRTdCSyxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxZQUFZQSxDQUFDQSwrQkFBK0JBLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUVoQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUE7WUFDbkIsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQy9DLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkUsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBU0EsQ0FBQ0E7WUFDekIsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQTtZQUNuQixPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMvQixDQUFDLENBQUNBLENBQUNBO1FBRUhBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFFOUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2xCQSxDQUFDQTs7QUFDTEwsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICogXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7aW5oZXJpdHN9IGZyb20gXCIuLi9saWIvb29wXCI7XG5pbXBvcnQge2FycmF5VG9NYXB9IGZyb20gXCIuLi9saWIvbGFuZ1wiO1xuaW1wb3J0IFRleHRNb2RlIGZyb20gXCIuL01vZGVcIjtcbmltcG9ydCBKYXZhU2NyaXB0TW9kZSBmcm9tIFwiLi9KYXZhU2NyaXB0TW9kZVwiO1xuaW1wb3J0IENzc01vZGUgZnJvbSBcIi4vQ3NzTW9kZVwiO1xuaW1wb3J0IEh0bWxIaWdobGlnaHRSdWxlcyBmcm9tIFwiLi9IdG1sSGlnaGxpZ2h0UnVsZXNcIjtcbmltcG9ydCBYbWxCZWhhdmlvdXIgZnJvbSBcIi4vYmVoYXZpb3VyL1htbEJlaGF2aW91clwiO1xuaW1wb3J0IEh0bWxGb2xkTW9kZSBmcm9tIFwiLi9mb2xkaW5nL0h0bWxGb2xkTW9kZVwiO1xuaW1wb3J0IEh0bWxDb21wbGV0aW9ucyBmcm9tIFwiLi9IdG1sQ29tcGxldGlvbnNcIjtcbmltcG9ydCBXb3JrZXJDbGllbnQgZnJvbSBcIi4uL3dvcmtlci9Xb3JrZXJDbGllbnRcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vRWRpdFNlc3Npb25cIjtcblxuLy8gaHR0cDovL3d3dy53My5vcmcvVFIvaHRtbDUvc3ludGF4Lmh0bWwjdm9pZC1lbGVtZW50c1xudmFyIHZvaWRFbGVtZW50cyA9IFtcImFyZWFcIiwgXCJiYXNlXCIsIFwiYnJcIiwgXCJjb2xcIiwgXCJlbWJlZFwiLCBcImhyXCIsIFwiaW1nXCIsIFwiaW5wdXRcIiwgXCJrZXlnZW5cIiwgXCJsaW5rXCIsIFwibWV0YVwiLCBcInBhcmFtXCIsIFwic291cmNlXCIsIFwidHJhY2tcIiwgXCJ3YnJcIl07XG52YXIgb3B0aW9uYWxFbmRUYWdzID0gW1wibGlcIiwgXCJkdFwiLCBcImRkXCIsIFwicFwiLCBcInJ0XCIsIFwicnBcIiwgXCJvcHRncm91cFwiLCBcIm9wdGlvblwiLCBcImNvbGdyb3VwXCIsIFwidGRcIiwgXCJ0aFwiXTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSHRtbE1vZGUgZXh0ZW5kcyBUZXh0TW9kZSB7XG4gICAgYmxvY2tDb21tZW50ID0geyBzdGFydDogXCI8IS0tXCIsIGVuZDogXCItLT5cIiB9O1xuICAgIHZvaWRFbGVtZW50cyA9IGFycmF5VG9NYXAodm9pZEVsZW1lbnRzKTtcbiAgICAkaWQgPSBcImFjZS9tb2RlL2h0bWxcIjtcbiAgICBmcmFnbWVudENvbnRleHQ7XG4gICAgJGNvbXBsZXRlcjogSHRtbENvbXBsZXRpb25zO1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5mcmFnbWVudENvbnRleHQgPSBvcHRpb25zICYmIG9wdGlvbnMuZnJhZ21lbnRDb250ZXh0O1xuICAgICAgICB0aGlzLkhpZ2hsaWdodFJ1bGVzID0gSHRtbEhpZ2hsaWdodFJ1bGVzO1xuICAgICAgICB0aGlzLiRiZWhhdmlvdXIgPSBuZXcgWG1sQmVoYXZpb3VyKCk7XG4gICAgICAgIHRoaXMuJGNvbXBsZXRlciA9IG5ldyBIdG1sQ29tcGxldGlvbnMoKTtcblxuICAgICAgICB0aGlzLmNyZWF0ZU1vZGVEZWxlZ2F0ZXMoe1xuICAgICAgICAgICAgXCJqcy1cIjogSmF2YVNjcmlwdE1vZGUsXG4gICAgICAgICAgICBcImNzcy1cIjogQ3NzTW9kZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmZvbGRpbmdSdWxlcyA9IG5ldyBIdG1sRm9sZE1vZGUodGhpcy52b2lkRWxlbWVudHMsIGFycmF5VG9NYXAob3B0aW9uYWxFbmRUYWdzKSk7XG4gICAgfVxuXG4gICAgZ2V0TmV4dExpbmVJbmRlbnQoc3RhdGU6IHN0cmluZywgbGluZTogc3RyaW5nLCB0YWI6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLiRnZXRJbmRlbnQobGluZSk7XG4gICAgfVxuXG4gICAgY2hlY2tPdXRkZW50KHN0YXRlOiBzdHJpbmcsIGxpbmU6IHN0cmluZywgdGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRDb21wbGV0aW9ucyhzdGF0ZTogc3RyaW5nLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgcG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBwcmVmaXg6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy4kY29tcGxldGVyLmdldENvbXBsZXRpb25zKHN0YXRlLCBzZXNzaW9uLCBwb3MsIHByZWZpeCk7XG4gICAgfVxuXG4gICAgY3JlYXRlV29ya2VyKHNlc3Npb246IEVkaXRTZXNzaW9uKTogV29ya2VyQ2xpZW50IHtcblxuICAgICAgICB2YXIgd29ya2VyID0gbmV3IFdvcmtlckNsaWVudChcImxpYi93b3JrZXIvd29ya2VyLXN5c3RlbWpzLmpzXCIpO1xuICAgICAgICB2YXIgbW9kZSA9IHRoaXM7XG5cbiAgICAgICAgd29ya2VyLm9uKFwiaW5pdEFmdGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgd29ya2VyLmF0dGFjaFRvRG9jdW1lbnQoc2Vzc2lvbi5nZXREb2N1bWVudCgpKTtcbiAgICAgICAgICAgIGlmIChtb2RlLmZyYWdtZW50Q29udGV4dCkge1xuICAgICAgICAgICAgICAgIHdvcmtlci5jYWxsKFwic2V0T3B0aW9uc1wiLCBbeyBjb250ZXh0OiBtb2RlLmZyYWdtZW50Q29udGV4dCB9XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdvcmtlci5vbihcImVycm9yXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHNlc3Npb24uc2V0QW5ub3RhdGlvbnMoZS5kYXRhKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgd29ya2VyLm9uKFwidGVybWluYXRlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2Vzc2lvbi5jbGVhckFubm90YXRpb25zKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdvcmtlci5pbml0KFwibGliL21vZGUvSHRtbFdvcmtlclwiLCBcImRlZmF1bHRcIik7XG5cbiAgICAgICAgcmV0dXJuIHdvcmtlcjtcbiAgICB9O1xufVxuIl19