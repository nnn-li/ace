"use strict";
import { decodeEventType, getDistance, INPUT_START, INPUT_MOVE, INPUT_END, INPUT_CANCEL, Recognizer, STATE_BEGAN, STATE_FAILED, STATE_RECOGNIZED, TOUCH_ACTION_MANIPULATION } from '../hammer';
import { setTimeoutContext } from '../utils';
function isCorrectTouchCount(input) {
    switch (input.eventType) {
        case INPUT_START:
            {
                return input.touchesLength === 1;
            }
            break;
        case INPUT_MOVE:
            {
                return input.touchesLength === 1;
            }
            break;
        case INPUT_END:
            {
                return input.touchesLength === 0;
            }
            break;
        case INPUT_CANCEL:
            {
                return true;
            }
            break;
        default: {
            throw new Error(decodeEventType(input.eventType));
        }
    }
}
export class TapRecognizer extends Recognizer {
    constructor(eventName, enabled) {
        super(eventName ? eventName : 'tap', enabled);
        this.count = 0;
        this.taps = 1;
        this.pointers = 1;
        this.time = 250;
        this.threshold = 6;
        this.interval = 300;
        this.posThreshold = 10;
    }
    getTouchAction() {
        return [TOUCH_ACTION_MANIPULATION];
    }
    process(input) {
        this.reset();
        if (!isCorrectTouchCount(input)) {
            return STATE_FAILED;
        }
        if ((input.eventType & INPUT_START) && (this.count === 0)) {
            this.center = input.center;
            return this.failTimeout();
        }
        if (input.distance >= this.threshold) {
            return STATE_FAILED;
        }
        if (input.deltaTime >= this.time) {
            return STATE_FAILED;
        }
        if (input.eventType !== INPUT_END) {
            this.center = input.center;
            return this.failTimeout();
        }
        else {
        }
        var validInterval = this.pTime ? (input.timeStamp - this.pTime < this.interval) : true;
        var validMultiTap = !this.pCenter || getDistance(this.pCenter, input.center) < this.posThreshold;
        this.pTime = input.timeStamp;
        this.pCenter = input.center;
        if (!validMultiTap || !validInterval) {
            this.count = 1;
        }
        else {
            this.count += 1;
        }
        var tapCount = this.count % this.taps;
        if (tapCount === 0) {
            if (!this.hasRequireFailures()) {
                return STATE_RECOGNIZED;
            }
            else {
                this._timer = setTimeoutContext(function () {
                    this.state = STATE_RECOGNIZED;
                    this.tryEmit();
                }, this.interval, this);
                return STATE_BEGAN;
            }
        }
        return STATE_FAILED;
    }
    failTimeout() {
        this._timer = setTimeoutContext(function () {
            this.state = STATE_FAILED;
        }, this.interval, this);
        return STATE_FAILED;
    }
    reset() {
        clearTimeout(this._timer);
    }
    emit() {
        if (this.state === STATE_RECOGNIZED) {
            this.manager.emit(this.eventName, this.center);
        }
    }
}
