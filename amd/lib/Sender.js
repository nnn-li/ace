var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './event_emitter'], function (require, exports, event_emitter_1) {
    /**
     * Used in Web Workers.
     * Uses postMessage to communicate with a taget window.
     */
    var Sender = (function (_super) {
        __extends(Sender, _super);
        function Sender(target) {
            _super.call(this);
            this.target = target;
        }
        // FIXME: I'm not sure why we extend EventEmitterClass? Convenience?
        Sender.prototype.callback = function (data, callbackId) {
            this.target.postMessage({ type: "call", id: callbackId, data: data }, void 0);
        };
        // FIXME: I'm not sure why we extend EventEmitterClass? Convenience?
        Sender.prototype.emit = function (name, data) {
            this.target.postMessage({ type: "event", name: name, data: data }, void 0);
        };
        return Sender;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Sender;
});
