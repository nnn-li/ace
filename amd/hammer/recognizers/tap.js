var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", '../hammer', '../utils'], function (require, exports, hammer_1, utils_1) {
    function isCorrectTouchCount(input) {
        switch (input.eventType) {
            case hammer_1.INPUT_START:
                {
                    return input.touchesLength === 1;
                }
                break;
            case hammer_1.INPUT_MOVE:
                {
                    return input.touchesLength === 1;
                }
                break;
            case hammer_1.INPUT_END:
                {
                    return input.touchesLength === 0;
                }
                break;
            case hammer_1.INPUT_CANCEL:
                {
                    return true;
                }
                break;
            default: {
                throw new Error(hammer_1.decodeEventType(input.eventType));
            }
        }
    }
    var TapRecognizer = (function (_super) {
        __extends(TapRecognizer, _super);
        function TapRecognizer(eventName, enabled) {
            _super.call(this, eventName ? eventName : 'tap', enabled);
            //private _input: IComputedEvent;
            this.count = 0;
            this.taps = 1;
            this.pointers = 1;
            this.time = 250; // max time of the pointer to be down (like finger on the screen)
            this.threshold = 6; // a minimal movement is ok, but keep it low
            this.interval = 300; // max time between the multi-tap taps
            this.posThreshold = 10; // a multi-tap can be a bit off the initial position
        }
        TapRecognizer.prototype.getTouchAction = function () {
            return [hammer_1.TOUCH_ACTION_MANIPULATION];
        };
        TapRecognizer.prototype.process = function (input) {
            this.reset();
            if (!isCorrectTouchCount(input)) {
                return hammer_1.STATE_FAILED;
            }
            if ((input.eventType & hammer_1.INPUT_START) && (this.count === 0)) {
                this.center = input.center;
                return this.failTimeout();
            }
            if (input.distance >= this.threshold) {
                return hammer_1.STATE_FAILED;
            }
            if (input.deltaTime >= this.time) {
                return hammer_1.STATE_FAILED;
            }
            // and we've reached an end event, so a tap is possible
            if (input.eventType !== hammer_1.INPUT_END) {
                this.center = input.center;
                return this.failTimeout();
            }
            else {
            }
            var validInterval = this.pTime ? (input.timeStamp - this.pTime < this.interval) : true;
            var validMultiTap = !this.pCenter || hammer_1.getDistance(this.pCenter, input.center) < this.posThreshold;
            this.pTime = input.timeStamp;
            this.pCenter = input.center;
            if (!validMultiTap || !validInterval) {
                this.count = 1;
            }
            else {
                this.count += 1;
            }
            // if tap count matches we have recognized it,
            // else it has began recognizing...
            var tapCount = this.count % this.taps;
            if (tapCount === 0) {
                // no failing requirements, immediately trigger the tap event
                // or wait as long as the multitap interval to trigger
                if (!this.hasRequireFailures()) {
                    return hammer_1.STATE_RECOGNIZED;
                }
                else {
                    this._timer = utils_1.setTimeoutContext(function () {
                        this.state = hammer_1.STATE_RECOGNIZED;
                        this.tryEmit();
                    }, this.interval, this);
                    return hammer_1.STATE_BEGAN;
                }
            }
            return hammer_1.STATE_FAILED;
        };
        TapRecognizer.prototype.failTimeout = function () {
            this._timer = utils_1.setTimeoutContext(function () {
                this.state = hammer_1.STATE_FAILED;
            }, this.interval, this);
            return hammer_1.STATE_FAILED;
        };
        TapRecognizer.prototype.reset = function () {
            clearTimeout(this._timer);
        };
        TapRecognizer.prototype.emit = function () {
            if (this.state === hammer_1.STATE_RECOGNIZED) {
                this.manager.emit(this.eventName, this.center);
            }
        };
        return TapRecognizer;
    })(hammer_1.Recognizer);
    exports.TapRecognizer = TapRecognizer;
});
