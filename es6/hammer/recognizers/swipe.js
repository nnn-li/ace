import { ContinuousRecognizer } from './attribute';
import { PanRecognizer } from './pan';
import { DIRECTION_HORIZONTAL, DIRECTION_VERTICAL, INPUT_END } from '../hammer';
export class SwipeRecognizer extends ContinuousRecognizer {
    constructor(eventName, enabled) {
        super(eventName, enabled, 1);
        this.displacementThreshold = 10;
        this.speedThreshold = 0.65;
        this.direction = DIRECTION_HORIZONTAL | DIRECTION_VERTICAL;
    }
    getTouchAction() {
        return PanRecognizer.prototype.getTouchAction.call(this);
    }
    attributeTest(input) {
        var speed;
        if (this.direction & (DIRECTION_HORIZONTAL | DIRECTION_VERTICAL)) {
            speed = input.velocity.norm();
        }
        else if (this.direction & DIRECTION_HORIZONTAL) {
            speed = Math.abs(input.velocity.x);
        }
        else if (this.direction & DIRECTION_VERTICAL) {
            speed = Math.abs(input.velocity.y);
        }
        var isParallel = (this.direction & input.direction) > 0;
        var isFarEnough = input.distance > this.displacementThreshold;
        var isFastEnough = speed > this.speedThreshold;
        var isEndEventType = (input.eventType & INPUT_END) > 0;
        return super.attributeTest(input) && isParallel && isFarEnough && isFastEnough && isEndEventType;
    }
    emit() {
        var direction = undefined;
        var event = new Event('swipe');
        if (direction) {
            this.manager.emit(this.eventName + direction, event);
        }
        this.manager.emit(this.eventName, event);
    }
}
