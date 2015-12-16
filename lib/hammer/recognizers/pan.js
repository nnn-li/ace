"use strict";
import { ContinuousRecognizer } from './attribute';
import { DIRECTION_ALL, DIRECTION_DOWN, DIRECTION_HORIZONTAL, DIRECTION_LEFT, DIRECTION_RIGHT, DIRECTION_UNDEFINED, DIRECTION_UP, DIRECTION_VERTICAL, STATE_BEGAN, TOUCH_ACTION_PAN_X, TOUCH_ACTION_PAN_Y } from '../hammer';
export class PanRecognizer extends ContinuousRecognizer {
    constructor(eventName, enabled) {
        super(eventName, enabled, 1);
        this.direction = DIRECTION_ALL;
        this.threshold = 10;
    }
    setDirection(direction) {
        this.direction = direction;
        return this;
    }
    setThreshold(threshold) {
        this.threshold = threshold;
        return this;
    }
    getTouchAction() {
        var actions = [];
        if (this.direction & DIRECTION_HORIZONTAL) {
            actions.push(TOUCH_ACTION_PAN_Y);
        }
        if (this.direction & DIRECTION_VERTICAL) {
            actions.push(TOUCH_ACTION_PAN_X);
        }
        return actions;
    }
    directionTest(input) {
        var hasMoved = true;
        var distance = input.distance;
        var direction = input.direction;
        var x = input.movement.x;
        var y = input.movement.y;
        if (!(direction & this.direction)) {
            if (this.direction & DIRECTION_HORIZONTAL) {
                direction = (x === 0) ? DIRECTION_UNDEFINED : (x < 0) ? DIRECTION_LEFT : DIRECTION_RIGHT;
                hasMoved = x != this.pX;
                distance = Math.abs(input.movement.x);
            }
            else {
                direction = (y === 0) ? DIRECTION_UNDEFINED : (y < 0) ? DIRECTION_UP : DIRECTION_DOWN;
                hasMoved = y != this.pY;
                distance = Math.abs(input.movement.y);
            }
        }
        var directionAllowed = (direction & this.direction) > 0;
        return hasMoved && distance > this.threshold && directionAllowed;
    }
    attributeTest(input) {
        this.movement = input.movement;
        if (input.movement) {
            var directionOK = this.directionTest(input);
            var began = (this.state & STATE_BEGAN) > 0;
            return super.attributeTest(input) && (began || (!began && directionOK));
        }
        else {
            return true;
        }
    }
    emit() {
        if (this.movement) {
            this.manager.emit(this.eventName, this.movement);
        }
    }
}
