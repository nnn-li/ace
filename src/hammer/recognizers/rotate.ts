import attribute = require('./attribute');
import hammer = require('../hammer');
import utils = require('../utils');

/**
 * Rotate
 * Recognized when two or more pointer are moving in a circular motion.
 * @constructor
 * @extends ContinuousRecognizer
 */
export class RotateRecognizer extends attribute.ContinuousRecognizer {

  private threshold = 0;

  constructor(eventName: string, enabled: boolean) {
    super(eventName, enabled, 2);
  }

  getTouchAction(): string[] {
    return [hammer.TOUCH_ACTION_NONE];
  }

  attributeTest(input: hammer.IComputedEvent): boolean {
    return super.attributeTest(input) && (Math.abs(input.rotation) > this.threshold || (this.state & hammer.STATE_BEGAN) > 0);
  }
}
