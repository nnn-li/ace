import hammer = require('../hammer');
import utils = require('../utils');

export class ContinuousRecognizer extends hammer.Recognizer {
  private pointers: number;
  /**
   * This recognizer is just used as a base for the simple attribute recognizers.
   * @constructor
   * @extends Recognizer
   */
  constructor(eventName: string, enabled: boolean, pointers: number) {
      super(eventName, enabled);
      this.pointers = pointers;
  }

  /**
   * Used to check if the recognizer receives valid input, like input.distance > 10.
   * @memberof ContinuousRecognizer
   * @param {IComputedEvent} input
   * @returns {Boolean} recognized
   */
  attributeTest(input: hammer.IComputedEvent): boolean {
    switch(input.eventType) {
      case hammer.INPUT_START: {
        return input.touchesLength === this.pointers;
      }
      break;
      case hammer.INPUT_MOVE: {
        return input.touchesLength === this.pointers;
      }
      break;
      case hammer.INPUT_END: {
        return input.touchesLength === this.pointers - 1;
      }
      break;
      case hammer.INPUT_CANCEL: {
        return true;
      }
      break;
      default : {
        throw new Error(hammer.decodeEventType(input.eventType));
      }
    }
  }

  /**
   * Process the input and return the state for the recognizer
   * @memberof ContinuousRecognizer
   * @param {Object} input
   * @returns {*} State
   */
  process(input: hammer.IComputedEvent): number {

    var state = this.state;
    var eventType = input.eventType;

    var isRecognized = state & (hammer.STATE_BEGAN | hammer.STATE_CHANGED);
    var isValid = this.attributeTest(input);

    // on cancel input and we've recognized before, return STATE_CANCELLED
    if (isRecognized && (eventType & hammer.INPUT_CANCEL || !isValid)) {
      return state | hammer.STATE_CANCELLED;
    }
    else if (isRecognized || isValid) {
      if (eventType & hammer.INPUT_END) {
        return state | hammer.STATE_RECOGNIZED;
      }
      else if (!(state & hammer.STATE_BEGAN)) {
        return hammer.STATE_BEGAN;
      }
      else {
        return state | hammer.STATE_CHANGED;
      }
    }
    return hammer.STATE_FAILED;
  }
}
