"use strict";
export default class Behaviour {
    constructor() {
        this.$behaviours = {};
    }
    add(name, action, callback) {
        switch (undefined) {
            case this.$behaviours:
                this.$behaviours = {};
            case this.$behaviours[name]:
                this.$behaviours[name] = {};
        }
        this.$behaviours[name][action] = callback;
    }
    addBehaviours(behaviours) {
        for (var key in behaviours) {
            for (var action in behaviours[key]) {
                this.add(key, action, behaviours[key][action]);
            }
        }
    }
    remove(name) {
        if (this.$behaviours && this.$behaviours[name]) {
            delete this.$behaviours[name];
        }
    }
    inherit(base, filter) {
        var behaviours = base.getBehaviours(filter);
        this.addBehaviours(behaviours);
    }
    getBehaviours(filter) {
        if (!filter) {
            return this.$behaviours;
        }
        else {
            var ret = {};
            for (var i = 0; i < filter.length; i++) {
                if (this.$behaviours[filter[i]]) {
                    ret[filter[i]] = this.$behaviours[filter[i]];
                }
            }
            return ret;
        }
    }
}
