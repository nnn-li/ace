import { INPUT_START, INPUT_CANCEL, INPUT_END, Recognizer, STATE_RECOGNIZED, STATE_FAILED, TOUCH_ACTION_AUTO } from '../hammer';
import { setTimeoutContext } from '../utils';
export class PressRecognizer extends Recognizer {
    constructor(eventName, enabled) {
        super(eventName ? eventName : 'press', enabled);
        this.pointers = 1;
        this.time = 500;
        this.threshold = 5;
        this._timer = null;
        this._input = null;
    }
    getTouchAction() {
        return [TOUCH_ACTION_AUTO];
    }
    process(input) {
        var validPointers = input.touchesLength === this.pointers;
        var validMovement = input.distance < this.threshold;
        var validTime = input.deltaTime > this.time;
        this._input = input;
        if (!validMovement || !validPointers || (input.eventType & (INPUT_END | INPUT_CANCEL) && !validTime)) {
            this.reset();
        }
        else if (input.eventType & INPUT_START) {
            this.reset();
            this._timer = setTimeoutContext(function () {
                this.state = STATE_RECOGNIZED;
                this.tryEmit();
            }, this.time, this);
        }
        else if (input.eventType & INPUT_END) {
            return STATE_RECOGNIZED;
        }
        return STATE_FAILED;
    }
    reset() {
        clearTimeout(this._timer);
    }
    emit() {
        if (this.state !== STATE_RECOGNIZED) {
            return;
        }
        var event = new Event('press');
        this.manager.emit(this.eventName, event);
    }
}
