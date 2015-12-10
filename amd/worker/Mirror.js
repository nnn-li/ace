define(["require", "exports", "../EditorDocument", "../lib/lang"], function (require, exports, EditorDocument_1, lang_1) {
    var Mirror = (function () {
        /**
         * Initializes the 'sender' property to the specified argument.
         * Initializes the 'doc' property to a new EditDocument.
         * Initializes the 'deferredUpdate' property to a delayed call to 'onUpdate'.
         * Binds the 'sender' "change" event to a function
         */
        function Mirror(sender, timeout) {
            if (timeout === void 0) { timeout = 500; }
            this.sender = sender;
            this.$timeout = timeout;
            this.doc = new EditorDocument_1.default("");
            var deferredUpdate = this.deferredUpdate = lang_1.delayedCall(this.onUpdate.bind(this));
            // Binding for use in the following callback.
            var _self = this;
            sender.on('change', function (e) {
                _self.doc.applyDeltas(e.data);
                if (_self.$timeout) {
                    return deferredUpdate.schedule(_self.$timeout);
                }
                else {
                    // I'm not sure that we need to special-case this code.
                    _self.onUpdate();
                }
            });
        }
        Mirror.prototype.setTimeout = function (timeout) {
            this.$timeout = timeout;
        };
        Mirror.prototype.setValue = function (value) {
            this.doc.setValue(value);
            this.deferredUpdate.schedule(this.$timeout);
        };
        Mirror.prototype.getValue = function (callbackId) {
            this.sender.callback(this.doc.getValue(), callbackId);
        };
        /**
         * Called after the timeout period. Derived classes will normally perform
         * a computationally expensive analysis then report annotations to the
         * sender.
         */
        Mirror.prototype.onUpdate = function () {
            // abstract method
        };
        Mirror.prototype.isPending = function () {
            return this.deferredUpdate.isPending();
        };
        return Mirror;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Mirror;
});
