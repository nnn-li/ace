import { ContinuousRecognizer } from './attribute';
import { STATE_BEGAN, TOUCH_ACTION_NONE } from '../hammer';
export class PinchRecognizer extends ContinuousRecognizer {
    constructor(eventName, enabled) {
        super(eventName, enabled, 2);
        this.threshold = 2;
        this.scale = 1;
    }
    getTouchAction() {
        return [TOUCH_ACTION_NONE];
    }
    attributeTest(input) {
        var isBegan = (this.state & STATE_BEGAN) > 0;
        this.scale = input.scale;
        return super.attributeTest(input) && (Math.abs(this.scale - 1) > this.threshold || isBegan);
    }
    emit() {
        if (this.scale !== 1) {
            var inOut = this.scale < 1 ? 'in' : 'out';
            var event = new Event('pinch');
            this.manager.emit(this.eventName + inOut, event);
        }
    }
}
