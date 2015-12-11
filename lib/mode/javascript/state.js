"use strict";
import NameStack from "./name-stack";
export var state = {
    option: {},
    cache: {},
    condition: void 0,
    directive: {},
    forinifcheckneeded: false,
    forinifchecks: void 0,
    funct: null,
    ignored: {},
    tab: "",
    lines: [],
    syntax: {},
    jsonMode: false,
    nameStack: new NameStack(),
    tokens: { prev: null, next: null, curr: null },
    inClassBody: false,
    ignoredLines: {},
    isStrict: function () {
        return this.directive["use strict"] || this.inClassBody ||
            this.option.module || this.option.strict === "implied";
    },
    inMoz: function () {
        return this.option.moz;
    },
    inES6: function (strict) {
        if (strict) {
            return this.option.esversion === 6;
        }
        return this.option.moz || this.option.esversion >= 6;
    },
    inES5: function (strict) {
        if (strict) {
            return (!this.option.esversion || this.option.esversion === 5) && !this.option.moz;
        }
        return !this.option.esversion || this.option.esversion >= 5 || this.option.moz;
    },
    reset: function () {
        this.tokens = {
            prev: null,
            next: null,
            curr: null
        };
        this.option = {};
        this.funct = null;
        this.ignored = {};
        this.directive = {};
        this.jsonMode = false;
        this.jsonWarnings = [];
        this.lines = [];
        this.tab = "";
        this.cache = {};
        this.ignoredLines = {};
        this.forinifcheckneeded = false;
        this.nameStack = new NameStack();
        this.inClassBody = false;
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9qYXZhc2NyaXB0L3N0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztPQUNOLFNBQVMsTUFBTSxjQUFjO0FBR3BDLFdBQVcsS0FBSyxHQXNCWjtJQUNJLE1BQU0sRUFBRSxFQUFFO0lBQ1YsS0FBSyxFQUFFLEVBQUU7SUFDVCxTQUFTLEVBQUUsS0FBSyxDQUFDO0lBQ2pCLFNBQVMsRUFBRSxFQUFFO0lBQ2Isa0JBQWtCLEVBQUUsS0FBSztJQUN6QixhQUFhLEVBQUUsS0FBSyxDQUFDO0lBQ3JCLEtBQUssRUFBRSxJQUFJO0lBQ1gsT0FBTyxFQUFFLEVBQUU7SUFDWCxHQUFHLEVBQUUsRUFBRTtJQUNQLEtBQUssRUFBRSxFQUFFO0lBQ1QsTUFBTSxFQUFFLEVBQUU7SUFDVixRQUFRLEVBQUUsS0FBSztJQUNmLFNBQVMsRUFBRSxJQUFJLFNBQVMsRUFBRTtJQUMxQixNQUFNLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtJQUM5QyxXQUFXLEVBQUUsS0FBSztJQUNsQixZQUFZLEVBQUUsRUFBRTtJQUtoQixRQUFRLEVBQUU7UUFDTixNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVztZQUNuRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUM7SUFDL0QsQ0FBQztJQUlELEtBQUssRUFBRTtRQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUMzQixDQUFDO0lBTUQsS0FBSyxFQUFFLFVBQVMsTUFBZ0I7UUFDNUIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNULE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUM7SUFDekQsQ0FBQztJQU1ELEtBQUssRUFBRSxVQUFTLE1BQWdCO1FBQzVCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDVCxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7UUFDdkYsQ0FBQztRQUNELE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNuRixDQUFDO0lBR0QsS0FBSyxFQUFFO1FBQ0gsSUFBSSxDQUFDLE1BQU0sR0FBRztZQUNWLElBQUksRUFBRSxJQUFJO1lBQ1YsSUFBSSxFQUFFLElBQUk7WUFDVixJQUFJLEVBQUUsSUFBSTtTQUNiLENBQUM7UUFFRixJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNqQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO0lBQzdCLENBQUM7Q0FDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5pbXBvcnQgTmFtZVN0YWNrIGZyb20gXCIuL25hbWUtc3RhY2tcIjtcbmltcG9ydCBKU0hpbnRPcHRpb25zIGZyb20gXCIuL0pTSGludE9wdGlvbnNcIjtcblxuZXhwb3J0IHZhciBzdGF0ZToge1xuICAgIG9wdGlvbjogSlNIaW50T3B0aW9ucztcbiAgICBjYWNoZToge307XG4gICAgY29uZGl0aW9uOiBib29sZWFuO1xuICAgIGRpcmVjdGl2ZToge307XG4gICAgZnVuY3Q7XG4gICAgaWdub3JlZDogeyBbbGluZTogc3RyaW5nXTogYm9vbGVhbiB9O1xuICAgIHRhYjogc3RyaW5nO1xuICAgIGxpbmVzOiBzdHJpbmdbXTtcbiAgICBzeW50YXg6IHsgW25hbWU6IHN0cmluZ106IGFueSB9O1xuICAgIGZvcmluaWZjaGVja25lZWRlZDogYm9vbGVhbjtcbiAgICBmb3JpbmlmY2hlY2tzOiBhbnlbXTtcbiAgICBpc1N0cmljdDogKCkgPT4gYm9vbGVhbjtcbiAgICBpbk1vejogKCkgPT4gYm9vbGVhbjtcbiAgICBpbkVTNjogKHN0cmljdD86IGJvb2xlYW4pID0+IGJvb2xlYW47XG4gICAgaW5FUzU6IChzdHJpY3Q/OiBib29sZWFuKSA9PiBib29sZWFuO1xuICAgIGluQ2xhc3NCb2R5OiBib29sZWFuO1xuICAgIGlnbm9yZWRMaW5lczogeyBbbGluZTogc3RyaW5nXTogYm9vbGVhbiB9LFxuICAgIGpzb25Nb2RlOiBib29sZWFuO1xuICAgIG5hbWVTdGFjazogTmFtZVN0YWNrO1xuICAgIHJlc2V0OiAoKSA9PiB2b2lkO1xuICAgIHRva2VuczogeyBwcmV2OyBuZXh0OyBjdXJyIH07XG59ID0ge1xuICAgICAgICBvcHRpb246IHt9LFxuICAgICAgICBjYWNoZToge30sXG4gICAgICAgIGNvbmRpdGlvbjogdm9pZCAwLFxuICAgICAgICBkaXJlY3RpdmU6IHt9LFxuICAgICAgICBmb3JpbmlmY2hlY2tuZWVkZWQ6IGZhbHNlLFxuICAgICAgICBmb3JpbmlmY2hlY2tzOiB2b2lkIDAsXG4gICAgICAgIGZ1bmN0OiBudWxsLFxuICAgICAgICBpZ25vcmVkOiB7fSxcbiAgICAgICAgdGFiOiBcIlwiLFxuICAgICAgICBsaW5lczogW10sXG4gICAgICAgIHN5bnRheDoge30sXG4gICAgICAgIGpzb25Nb2RlOiBmYWxzZSxcbiAgICAgICAgbmFtZVN0YWNrOiBuZXcgTmFtZVN0YWNrKCksXG4gICAgICAgIHRva2VuczogeyBwcmV2OiBudWxsLCBuZXh0OiBudWxsLCBjdXJyOiBudWxsIH0sXG4gICAgICAgIGluQ2xhc3NCb2R5OiBmYWxzZSxcbiAgICAgICAgaWdub3JlZExpbmVzOiB7fSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGV0ZXJtaW5lIGlmIHRoZSBjb2RlIGN1cnJlbnRseSBiZWluZyBsaW50ZWQgaXMgc3RyaWN0IG1vZGUgY29kZS5cbiAgICAgICAgICovXG4gICAgICAgIGlzU3RyaWN0OiBmdW5jdGlvbigpOiBib29sZWFuIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRpcmVjdGl2ZVtcInVzZSBzdHJpY3RcIl0gfHwgdGhpcy5pbkNsYXNzQm9keSB8fFxuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uLm1vZHVsZSB8fCB0aGlzLm9wdGlvbi5zdHJpY3QgPT09IFwiaW1wbGllZFwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIEFzc3VtcHRpb246IGNocm9ub2xvZ2ljYWxseSBFUzMgPCBFUzUgPCBFUzYgPCBNb3pcblxuICAgICAgICBpbk1vejogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb24ubW96O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHN0cmljdCAtIFdoZW4gYHRydWVgLCBvbmx5IGNvbnNpZGVyIEVTNiB3aGVuIGluXG4gICAgICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlc3ZlcnNpb246IDZcIiBjb2RlLlxuICAgICAgICAgKi9cbiAgICAgICAgaW5FUzY6IGZ1bmN0aW9uKHN0cmljdD86IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIGlmIChzdHJpY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb24uZXN2ZXJzaW9uID09PSA2O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9uLm1veiB8fCB0aGlzLm9wdGlvbi5lc3ZlcnNpb24gPj0gNjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtib29sZWFufSBzdHJpY3QgLSBXaGVuIGB0cnVlYCwgcmV0dXJuIGB0cnVlYCBvbmx5IHdoZW5cbiAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICBlc3ZlcnNpb24gaXMgZXhhY3RseSA1XG4gICAgICAgICAqL1xuICAgICAgICBpbkVTNTogZnVuY3Rpb24oc3RyaWN0PzogYm9vbGVhbikge1xuICAgICAgICAgICAgaWYgKHN0cmljdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAoIXRoaXMub3B0aW9uLmVzdmVyc2lvbiB8fCB0aGlzLm9wdGlvbi5lc3ZlcnNpb24gPT09IDUpICYmICF0aGlzLm9wdGlvbi5tb3o7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gIXRoaXMub3B0aW9uLmVzdmVyc2lvbiB8fCB0aGlzLm9wdGlvbi5lc3ZlcnNpb24gPj0gNSB8fCB0aGlzLm9wdGlvbi5tb3o7XG4gICAgICAgIH0sXG5cblxuICAgICAgICByZXNldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLnRva2VucyA9IHtcbiAgICAgICAgICAgICAgICBwcmV2OiBudWxsLFxuICAgICAgICAgICAgICAgIG5leHQ6IG51bGwsXG4gICAgICAgICAgICAgICAgY3VycjogbnVsbFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdGhpcy5vcHRpb24gPSB7fTtcbiAgICAgICAgICAgIHRoaXMuZnVuY3QgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5pZ25vcmVkID0ge307XG4gICAgICAgICAgICB0aGlzLmRpcmVjdGl2ZSA9IHt9O1xuICAgICAgICAgICAgdGhpcy5qc29uTW9kZSA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5qc29uV2FybmluZ3MgPSBbXTtcbiAgICAgICAgICAgIHRoaXMubGluZXMgPSBbXTtcbiAgICAgICAgICAgIHRoaXMudGFiID0gXCJcIjtcbiAgICAgICAgICAgIHRoaXMuY2FjaGUgPSB7fTsgLy8gTm9kZS5KUyBkb2Vzbid0IGhhdmUgTWFwLiBTbmlmZi5cbiAgICAgICAgICAgIHRoaXMuaWdub3JlZExpbmVzID0ge307XG4gICAgICAgICAgICB0aGlzLmZvcmluaWZjaGVja25lZWRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5uYW1lU3RhY2sgPSBuZXcgTmFtZVN0YWNrKCk7XG4gICAgICAgICAgICB0aGlzLmluQ2xhc3NCb2R5ID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9O1xuIl19