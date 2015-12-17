"use strict";
import { requestAnimationFrame } from './lib/event';
export default class RenderLoop {
    constructor(onRender, $window = window) {
        this.pending = false;
        this.changes = 0;
        this.onRender = onRender;
        this.$window = $window;
    }
    schedule(change) {
        this.changes = this.changes | change;
        if (!this.pending && this.changes) {
            this.pending = true;
            var self = this;
            requestAnimationFrame(function () {
                self.pending = false;
                var changes;
                while (changes = self.changes) {
                    self.changes = 0;
                    self.onRender(changes);
                }
            }, this.$window);
        }
    }
}
