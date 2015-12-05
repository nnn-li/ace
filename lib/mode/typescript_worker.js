var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var oop = require('../lib/oop');
var mir = require('../worker/mirror');
var TypeScriptWorker = (function (_super) {
    __extends(TypeScriptWorker, _super);
    function TypeScriptWorker(sender) {
        _super.call(this, sender, 500);
        this.setOptions();
        sender.emit('initAfter');
    }
    TypeScriptWorker.prototype.setOptions = function (options) {
        this.options = options || {};
    };
    TypeScriptWorker.prototype.changeOptions = function (newOptions) {
        oop.mixin(this.options, newOptions);
        this.deferredUpdate.schedule(100);
    };
    TypeScriptWorker.prototype.onUpdate = function () {
        this.sender.emit("compiled");
    };
    return TypeScriptWorker;
})(mir.Mirror);
exports.TypeScriptWorker = TypeScriptWorker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNjcmlwdF93b3JrZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9kZS90eXBlc2NyaXB0X3dvcmtlci50cyJdLCJuYW1lcyI6WyJUeXBlU2NyaXB0V29ya2VyIiwiVHlwZVNjcmlwdFdvcmtlci5jb25zdHJ1Y3RvciIsIlR5cGVTY3JpcHRXb3JrZXIuc2V0T3B0aW9ucyIsIlR5cGVTY3JpcHRXb3JrZXIuY2hhbmdlT3B0aW9ucyIsIlR5cGVTY3JpcHRXb3JrZXIub25VcGRhdGUiXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsSUFBTyxHQUFHLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDbkMsSUFBTyxHQUFHLFdBQVcsa0JBQWtCLENBQUMsQ0FBQztBQVN6QztJQUFzQ0Esb0NBQVVBO0lBRzVDQSwwQkFBWUEsTUFBTUE7UUFDZEMsa0JBQU1BLE1BQU1BLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBRW5CQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUVsQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDN0JBLENBQUNBO0lBRU9ELHFDQUFVQSxHQUFsQkEsVUFBbUJBLE9BQVFBO1FBQ3ZCRSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFFT0Ysd0NBQWFBLEdBQXJCQSxVQUFzQkEsVUFBVUE7UUFDNUJHLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFFTUgsbUNBQVFBLEdBQWZBO1FBRUlJLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQUNMSix1QkFBQ0E7QUFBREEsQ0FBQ0EsQUF4QkQsRUFBc0MsR0FBRyxDQUFDLE1BQU0sRUF3Qi9DO0FBeEJZLHdCQUFnQixtQkF3QjVCLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgb29wID0gcmVxdWlyZSgnLi4vbGliL29vcCcpO1xuaW1wb3J0IG1pciA9IHJlcXVpcmUoJy4uL3dvcmtlci9taXJyb3InKTtcbmltcG9ydCBsYW5nID0gcmVxdWlyZSgnLi4vbGliL2xhbmcnKTtcbmltcG9ydCBkY20gPSByZXF1aXJlKCcuLi9kb2N1bWVudCcpO1xuXG4vKipcbiAqIERvZXNuJ3QgcmVhbGx5IGRvIG11Y2ggYmVjYXVzZSBUeXBlU2NyaXB0IHJlcXVpcmVzIHRoZSBjb25jZXB0IG9mIGEgd29ya3NwYWNlLlxuICogXG4gKiBIb3dldmVyLCBkb2VzIHByb3ZpZGUgc29tZSBub3RpZmljYXRpb25zIHRvIHRyaWdnZXIgZnVydGhlciBhY3Rpb25zLlxuICovXG5leHBvcnQgY2xhc3MgVHlwZVNjcmlwdFdvcmtlciBleHRlbmRzIG1pci5NaXJyb3Ige1xuICAgIHByaXZhdGUgb3B0aW9ucztcblxuICAgIGNvbnN0cnVjdG9yKHNlbmRlci8qRklYTUU6IGFjZS5Xb3JrZXJTZW5kZXIqLykge1xuICAgICAgICBzdXBlcihzZW5kZXIsIDUwMCk7XG5cbiAgICAgICAgdGhpcy5zZXRPcHRpb25zKCk7XG5cbiAgICAgICAgc2VuZGVyLmVtaXQoJ2luaXRBZnRlcicpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2V0T3B0aW9ucyhvcHRpb25zPykge1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIH1cblxuICAgIHByaXZhdGUgY2hhbmdlT3B0aW9ucyhuZXdPcHRpb25zKSB7XG4gICAgICAgIG9vcC5taXhpbih0aGlzLm9wdGlvbnMsIG5ld09wdGlvbnMpO1xuICAgICAgICB0aGlzLmRlZmVycmVkVXBkYXRlLnNjaGVkdWxlKDEwMCk7XG4gICAgfVxuXG4gICAgcHVibGljIG9uVXBkYXRlKCkge1xuICAgICAgICAvLyBUaGUgbm9ybWFsIGJlaGF2aW91ciBoZXJlIGlzIHRvIHBlcmZvcm0gYSBzeW50YXggY2hlY2sgYW5kIHJlcG9ydCBhbm5vdGF0aW9ucy4gXG4gICAgICAgIHRoaXMuc2VuZGVyLmVtaXQoXCJjb21waWxlZFwiKTtcbiAgICB9XG59XG4iXX0=