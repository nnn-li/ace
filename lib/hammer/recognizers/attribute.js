"use strict";
import { decodeEventType, INPUT_CANCEL, INPUT_END, INPUT_MOVE, INPUT_START, Recognizer, STATE_BEGAN, STATE_CANCELLED, STATE_CHANGED, STATE_FAILED, STATE_RECOGNIZED } from '../hammer';
export class ContinuousRecognizer extends Recognizer {
    constructor(eventName, enabled, pointers) {
        super(eventName, enabled);
        this.pointers = pointers;
    }
    attributeTest(input) {
        switch (input.eventType) {
            case INPUT_START:
                {
                    return input.touchesLength === this.pointers;
                }
                break;
            case INPUT_MOVE:
                {
                    return input.touchesLength === this.pointers;
                }
                break;
            case INPUT_END:
                {
                    return input.touchesLength === this.pointers - 1;
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
    process(input) {
        var state = this.state;
        var eventType = input.eventType;
        var isRecognized = state & (STATE_BEGAN | STATE_CHANGED);
        var isValid = this.attributeTest(input);
        if (isRecognized && (eventType & INPUT_CANCEL || !isValid)) {
            return state | STATE_CANCELLED;
        }
        else if (isRecognized || isValid) {
            if (eventType & INPUT_END) {
                return state | STATE_RECOGNIZED;
            }
            else if (!(state & STATE_BEGAN)) {
                return STATE_BEGAN;
            }
            else {
                return state | STATE_CHANGED;
            }
        }
        return STATE_FAILED;
    }
}
