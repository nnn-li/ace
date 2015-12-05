var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var attribute = require('./attribute');
var hammer = require('../hammer');
var RotateRecognizer = (function (_super) {
    __extends(RotateRecognizer, _super);
    function RotateRecognizer(eventName, enabled) {
        _super.call(this, eventName, enabled, 2);
        this.threshold = 0;
    }
    RotateRecognizer.prototype.getTouchAction = function () {
        return [hammer.TOUCH_ACTION_NONE];
    };
    RotateRecognizer.prototype.attributeTest = function (input) {
        return _super.prototype.attributeTest.call(this, input) && (Math.abs(input.rotation) > this.threshold || (this.state & hammer.STATE_BEGAN) > 0);
    };
    return RotateRecognizer;
})(attribute.ContinuousRecognizer);
exports.RotateRecognizer = RotateRecognizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm90YXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2hhbW1lci9yZWNvZ25pemVycy9yb3RhdGUudHMiXSwibmFtZXMiOlsiUm90YXRlUmVjb2duaXplciIsIlJvdGF0ZVJlY29nbml6ZXIuY29uc3RydWN0b3IiLCJSb3RhdGVSZWNvZ25pemVyLmdldFRvdWNoQWN0aW9uIiwiUm90YXRlUmVjb2duaXplci5hdHRyaWJ1dGVUZXN0Il0sIm1hcHBpbmdzIjoiOzs7OztBQUFBLElBQU8sU0FBUyxXQUFXLGFBQWEsQ0FBQyxDQUFDO0FBQzFDLElBQU8sTUFBTSxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBU3JDO0lBQXNDQSxvQ0FBOEJBO0lBSWxFQSwwQkFBWUEsU0FBaUJBLEVBQUVBLE9BQWdCQTtRQUM3Q0Msa0JBQU1BLFNBQVNBLEVBQUVBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBSHZCQSxjQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUl0QkEsQ0FBQ0E7SUFFREQseUNBQWNBLEdBQWRBO1FBQ0VFLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBRURGLHdDQUFhQSxHQUFiQSxVQUFjQSxLQUE0QkE7UUFDeENHLE1BQU1BLENBQUNBLGdCQUFLQSxDQUFDQSxhQUFhQSxZQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1SEEsQ0FBQ0E7SUFDSEgsdUJBQUNBO0FBQURBLENBQUNBLEFBZkQsRUFBc0MsU0FBUyxDQUFDLG9CQUFvQixFQWVuRTtBQWZZLHdCQUFnQixtQkFlNUIsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBhdHRyaWJ1dGUgPSByZXF1aXJlKCcuL2F0dHJpYnV0ZScpO1xuaW1wb3J0IGhhbW1lciA9IHJlcXVpcmUoJy4uL2hhbW1lcicpO1xuaW1wb3J0IHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBSb3RhdGVcbiAqIFJlY29nbml6ZWQgd2hlbiB0d28gb3IgbW9yZSBwb2ludGVyIGFyZSBtb3ZpbmcgaW4gYSBjaXJjdWxhciBtb3Rpb24uXG4gKiBAY29uc3RydWN0b3JcbiAqIEBleHRlbmRzIENvbnRpbnVvdXNSZWNvZ25pemVyXG4gKi9cbmV4cG9ydCBjbGFzcyBSb3RhdGVSZWNvZ25pemVyIGV4dGVuZHMgYXR0cmlidXRlLkNvbnRpbnVvdXNSZWNvZ25pemVyIHtcblxuICBwcml2YXRlIHRocmVzaG9sZCA9IDA7XG5cbiAgY29uc3RydWN0b3IoZXZlbnROYW1lOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICBzdXBlcihldmVudE5hbWUsIGVuYWJsZWQsIDIpO1xuICB9XG5cbiAgZ2V0VG91Y2hBY3Rpb24oKTogc3RyaW5nW10ge1xuICAgIHJldHVybiBbaGFtbWVyLlRPVUNIX0FDVElPTl9OT05FXTtcbiAgfVxuXG4gIGF0dHJpYnV0ZVRlc3QoaW5wdXQ6IGhhbW1lci5JQ29tcHV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBzdXBlci5hdHRyaWJ1dGVUZXN0KGlucHV0KSAmJiAoTWF0aC5hYnMoaW5wdXQucm90YXRpb24pID4gdGhpcy50aHJlc2hvbGQgfHwgKHRoaXMuc3RhdGUgJiBoYW1tZXIuU1RBVEVfQkVHQU4pID4gMCk7XG4gIH1cbn1cbiJdfQ==