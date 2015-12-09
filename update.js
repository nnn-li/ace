// Opt in to a restricted variant of JavaScript.

// 1. throws errors where normally silent.
// 2. fixes mistakes that make optimization difficult.
// 3. can be made to run faster.
// 4. prohibits syntax likely in future ES*.

// Why does "use strict" solve the problemo?
"use strict";
//class Test {
//  doSomething(cb) {
//    cb('Hello');
//  }
//}

//console.log(new Test().doSomething(text => console.log(text)));
//console.log(new Test().doSomething(function(text) {console.log(text)}));
console.log("Logging from update.js")

export class Foo {
  constructor() {
    console.log("Foo constructor")
  }
}

export default class Bar {
  constructor() {
    console.log("Bar constructor")
  }
}