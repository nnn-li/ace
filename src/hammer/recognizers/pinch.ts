import attribute = require('./attribute');
import hammer = require('../hammer');
import utils = require('../utils');
/**
 * Pinch
 * Recognized when two or more pointers are moving toward (zoom-in) or away from each other (zoom-out).
 * @constructor
 * @extends ContinuousRecognizer
 */
export class PinchRecognizer extends attribute.ContinuousRecognizer {
    private threshold = 2;
    private scale = 1;
    constructor(eventName: string, enabled: boolean) {
        super(eventName, enabled, 2);
    }
    getTouchAction(): string[] {
        return [hammer.TOUCH_ACTION_NONE];
    }
    attributeTest(input: hammer.IComputedEvent): boolean {
        var isBegan: boolean = (this.state & hammer.STATE_BEGAN) > 0;
        this.scale = input.scale;
        return super.attributeTest(input) && (Math.abs(this.scale - 1) > this.threshold || isBegan);
    }
    emit(): void {
        if (this.scale !== 1) {
            var inOut = this.scale < 1 ? 'in' : 'out';
            var event = new Event('pinch');
            this.manager.emit(this.eventName + inOut, event);
        }
    }
}
