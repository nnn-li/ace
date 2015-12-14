/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
"use strict";

import BehaviourCallback from "../BehaviourCallback";
import LanguageMode from "../LanguageMode";

/**
 * @class Behaviour
 */
export default class Behaviour {

    /**
     * A map from name to a map from action to a BehaviourCallback.
     *
     * @property $behaviours
     * @type { [name: string]: { [action: string]: BehaviourCallback } }
     */
    private $behaviours: { [name: string]: { [action: string]: BehaviourCallback } } = {};

    /**
     * @class Behaviour
     * @constructor
     */
    constructor() {
    }

    /**
     * @method add
     * @param name {string}
     * @param action {string}
     * @param callback
     */
    add(name: string, action: string, callback: BehaviourCallback): void {
        switch (undefined) {
            case this.$behaviours:
                this.$behaviours = {};
            case this.$behaviours[name]:
                this.$behaviours[name] = {};
        }
        this.$behaviours[name][action] = callback;
    }

    addBehaviours(behaviours: { [name: string]: { [action: string]: BehaviourCallback } }): void {
        for (var key in behaviours) {
            for (var action in behaviours[key]) {
                this.add(key, action, behaviours[key][action]);
            }
        }
    }

    remove(name: string): void {
        if (this.$behaviours && this.$behaviours[name]) {
            delete this.$behaviours[name];
        }
    }

    /**
     * @method inherit
     * @param base {Behaviour}
     * @param [filter] {string[]}
     * @return {void}
     */
    inherit(base: Behaviour, filter?: string[]): void {
        var behaviours = base.getBehaviours(filter);
        this.addBehaviours(behaviours);
    }

    getBehaviours(filter?: string[]): { [name: string]: { [action: string]: BehaviourCallback } } {
        if (!filter) {
            return this.$behaviours;
        }
        else {
            var ret: { [name: string]: { [action: string]: BehaviourCallback } } = {}
            for (var i = 0; i < filter.length; i++) {
                if (this.$behaviours[filter[i]]) {
                    ret[filter[i]] = this.$behaviours[filter[i]];
                }
            }
            return ret;
        }
    }
}
