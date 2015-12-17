import { ContinuousRecognizer } from './attribute';
import { STATE_BEGAN, TOUCH_ACTION_NONE } from '../hammer';
export class RotateRecognizer extends ContinuousRecognizer {
    constructor(eventName, enabled) {
        super(eventName, enabled, 2);
        this.threshold = 0;
    }
    getTouchAction() {
        return [TOUCH_ACTION_NONE];
    }
    attributeTest(input) {
        return super.attributeTest(input) && (Math.abs(input.rotation) > this.threshold || (this.state & STATE_BEGAN) > 0);
    }
}
