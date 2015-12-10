var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", '../hammer', '../utils'], function (require, exports, hammer_1, utils_1) {
    var PressRecognizer = (function (_super) {
        __extends(PressRecognizer, _super);
        /**
         * Press
         * Recognized when the pointer is down for x ms without any movement.
         * @constructor
         * @extends Recognizer
         */
        function PressRecognizer(eventName, enabled) {
            _super.call(this, eventName ? eventName : 'press', enabled);
            this.pointers = 1;
            this.time = 500; // minimal time of the pointer to be pressed
            this.threshold = 5; // a minimal movement is ok, but keep it low
            this._timer = null;
            this._input = null;
        }
        PressRecognizer.prototype.getTouchAction = function () {
            return [hammer_1.TOUCH_ACTION_AUTO];
        };
        PressRecognizer.prototype.process = function (input) {
            var validPointers = input.touchesLength === this.pointers;
            var validMovement = input.distance < this.threshold;
            var validTime = input.deltaTime > this.time;
            this._input = input;
            // we only allow little movement
            // and we've reached an end event, so a tap is possible
            if (!validMovement || !validPointers || (input.eventType & (hammer_1.INPUT_END | hammer_1.INPUT_CANCEL) && !validTime)) {
                this.reset();
            }
            else if (input.eventType & hammer_1.INPUT_START) {
                this.reset();
                this._timer = utils_1.setTimeoutContext(function () {
                    this.state = hammer_1.STATE_RECOGNIZED;
                    this.tryEmit();
                }, this.time, this);
            }
            else if (input.eventType & hammer_1.INPUT_END) {
                return hammer_1.STATE_RECOGNIZED;
            }
            return hammer_1.STATE_FAILED;
        };
        PressRecognizer.prototype.reset = function () {
            clearTimeout(this._timer);
        };
        PressRecognizer.prototype.emit = function () {
            if (this.state !== hammer_1.STATE_RECOGNIZED) {
                return;
            }
            var event = new Event('press');
            this.manager.emit(this.eventName, event);
        };
        return PressRecognizer;
    })(hammer_1.Recognizer);
    exports.PressRecognizer = PressRecognizer;
});
