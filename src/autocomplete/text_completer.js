"use strict";
import Range from "../Range";
function wordDistance(position, session) {
    var splitRegex = /[^a-zA-Z_0-9\$\-\u00C0-\u1FFF\u2C00-\uD7FF\w]+/;
    function getWordIndex() {
        var textBefore = session.getTextRange(Range.fromPoints({ row: 0, column: 0 }, position));
        return textBefore.split(splitRegex).length - 1;
    }
    var prefixPos = getWordIndex();
    var words = session.getValue().split(splitRegex);
    var wordScores = Object.create(null);
    var currentWord = words[prefixPos];
    words.forEach(function (word, index) {
        if (!word || word === currentWord)
            return;
        var distance = Math.abs(prefixPos - index);
        var score = words.length - distance;
        if (wordScores[word]) {
            wordScores[word] = Math.max(score, wordScores[word]);
        }
        else {
            wordScores[word] = score;
        }
    });
    return wordScores;
}
export default function getCompletions(editor, session, pos, prefix, callback) {
    var wordScore = wordDistance(pos, session);
    var wordList = Object.keys(wordScore);
    callback(null, wordList.map(function (word) {
        return {
            caption: word,
            value: word,
            score: wordScore[word],
            meta: "local"
        };
    }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dF9jb21wbGV0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0ZXh0X2NvbXBsZXRlci50cyJdLCJuYW1lcyI6WyJ3b3JkRGlzdGFuY2UiLCJ3b3JkRGlzdGFuY2UuZ2V0V29yZEluZGV4IiwiZ2V0Q29tcGxldGlvbnMiXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FNTixLQUFLLE1BQU0sVUFBVTtBQVk1QixzQkFBc0IsUUFBa0IsRUFBRSxPQUFvQjtJQUMxREEsSUFBSUEsVUFBVUEsR0FBV0EsZ0RBQWdEQSxDQUFDQTtJQUUxRUE7UUFDSUMsSUFBSUEsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekZBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO0lBQ25EQSxDQUFDQTtJQUVERCxJQUFJQSxTQUFTQSxHQUFXQSxZQUFZQSxFQUFFQSxDQUFDQTtJQUN2Q0EsSUFBSUEsS0FBS0EsR0FBYUEsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDM0RBLElBQUlBLFVBQVVBLEdBQWVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBRWpEQSxJQUFJQSxXQUFXQSxHQUFXQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUUzQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsSUFBWUEsRUFBRUEsS0FBYUE7UUFDOUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxLQUFLLFdBQVcsQ0FBQztZQUFDLE1BQU0sQ0FBQztRQUUxQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUMzQyxJQUFJLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQztRQUNwQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25CLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN6RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQzdCLENBQUM7SUFDTCxDQUFDLENBQUNBLENBQUNBO0lBQ0hBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBO0FBQ3RCQSxDQUFDQTtBQUtELHVDQUF1QyxNQUFjLEVBQUUsT0FBb0IsRUFBRSxHQUFhLEVBQUUsTUFBYyxFQUFFLFFBQWtEO0lBRTFKRSxJQUFJQSxTQUFTQSxHQUFlQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUV2REEsSUFBSUEsUUFBUUEsR0FBYUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFFaERBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLFVBQVNBLElBQVlBO1FBQzdDLE1BQU0sQ0FBQztZQUNILE9BQU8sRUFBRSxJQUFJO1lBQ2IsS0FBSyxFQUFFLElBQUk7WUFDWCxLQUFLLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQztZQUN0QixJQUFJLEVBQUUsT0FBTztTQUNoQixDQUFDO0lBQ04sQ0FBQyxDQUFDQSxDQUFDQSxDQUFDQTtBQUNSQSxDQUFDQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMiwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgQ29tcGxldGlvbiBmcm9tICcuLi9Db21wbGV0aW9uJztcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tICcuLi9FZGl0U2Vzc2lvbic7XG5pbXBvcnQgRWRpdG9yIGZyb20gJy4uL0VkaXRvcic7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSBcIi4uL1Bvc2l0aW9uXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4uL1JhbmdlXCI7XG5cbi8qKlxuICogQSBtYXAgZnJvbSB0aGUgd29yZCAoc3RyaW5nKSB0byBzY29yZSAobnVtYmVyKS5cbiAqL1xuaW50ZXJmYWNlIFdvcmRTY29yZXMge1xuICAgIFt3b3JkOiBzdHJpbmddOiBudW1iZXI7XG59XG5cbi8qKlxuICogRG9lcyBhIGRpc3RhbmNlIGFuYWx5c2lzIG9mIHRoZSB3b3JkIGF0IHBvc2l0aW9uIGBwb3NgIGluIGBkb2NgLlxuICovXG5mdW5jdGlvbiB3b3JkRGlzdGFuY2UocG9zaXRpb246IFBvc2l0aW9uLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IFdvcmRTY29yZXMge1xuICAgIHZhciBzcGxpdFJlZ2V4OiBSZWdFeHAgPSAvW15hLXpBLVpfMC05XFwkXFwtXFx1MDBDMC1cXHUxRkZGXFx1MkMwMC1cXHVEN0ZGXFx3XSsvO1xuXG4gICAgZnVuY3Rpb24gZ2V0V29yZEluZGV4KCk6IG51bWJlciB7XG4gICAgICAgIHZhciB0ZXh0QmVmb3JlID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UoUmFuZ2UuZnJvbVBvaW50cyh7IHJvdzogMCwgY29sdW1uOiAwIH0sIHBvc2l0aW9uKSk7XG4gICAgICAgIHJldHVybiB0ZXh0QmVmb3JlLnNwbGl0KHNwbGl0UmVnZXgpLmxlbmd0aCAtIDE7XG4gICAgfVxuXG4gICAgdmFyIHByZWZpeFBvczogbnVtYmVyID0gZ2V0V29yZEluZGV4KCk7XG4gICAgdmFyIHdvcmRzOiBzdHJpbmdbXSA9IHNlc3Npb24uZ2V0VmFsdWUoKS5zcGxpdChzcGxpdFJlZ2V4KTtcbiAgICB2YXIgd29yZFNjb3JlczogV29yZFNjb3JlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICB2YXIgY3VycmVudFdvcmQ6IHN0cmluZyA9IHdvcmRzW3ByZWZpeFBvc107XG5cbiAgICB3b3Jkcy5mb3JFYWNoKGZ1bmN0aW9uKHdvcmQ6IHN0cmluZywgaW5kZXg6IG51bWJlcikge1xuICAgICAgICBpZiAoIXdvcmQgfHwgd29yZCA9PT0gY3VycmVudFdvcmQpIHJldHVybjtcblxuICAgICAgICB2YXIgZGlzdGFuY2UgPSBNYXRoLmFicyhwcmVmaXhQb3MgLSBpbmRleCk7XG4gICAgICAgIHZhciBzY29yZSA9IHdvcmRzLmxlbmd0aCAtIGRpc3RhbmNlO1xuICAgICAgICBpZiAod29yZFNjb3Jlc1t3b3JkXSkge1xuICAgICAgICAgICAgd29yZFNjb3Jlc1t3b3JkXSA9IE1hdGgubWF4KHNjb3JlLCB3b3JkU2NvcmVzW3dvcmRdKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHdvcmRTY29yZXNbd29yZF0gPSBzY29yZTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiB3b3JkU2NvcmVzO1xufVxuXG4vKipcbiAqIFRoaXMgdGV4dHVhbCBjb21wbGV0ZXIgaXMgcmF0aGVyIGR1bWIuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGdldENvbXBsZXRpb25zKGVkaXRvcjogRWRpdG9yLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgcG9zOiBQb3NpdGlvbiwgcHJlZml4OiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyLCBjb21wbGV0aW9uczogQ29tcGxldGlvbltdKSA9PiB2b2lkKSB7XG5cbiAgICB2YXIgd29yZFNjb3JlOiBXb3JkU2NvcmVzID0gd29yZERpc3RhbmNlKHBvcywgc2Vzc2lvbik7XG5cbiAgICB2YXIgd29yZExpc3Q6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMod29yZFNjb3JlKTtcblxuICAgIGNhbGxiYWNrKG51bGwsIHdvcmRMaXN0Lm1hcChmdW5jdGlvbih3b3JkOiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNhcHRpb246IHdvcmQsXG4gICAgICAgICAgICB2YWx1ZTogd29yZCxcbiAgICAgICAgICAgIHNjb3JlOiB3b3JkU2NvcmVbd29yZF0sXG4gICAgICAgICAgICBtZXRhOiBcImxvY2FsXCJcbiAgICAgICAgfTtcbiAgICB9KSk7XG59XG5cbiJdfQ==