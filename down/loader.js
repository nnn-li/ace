/*global System*/
importScripts('/jspm_packages/system.js', '/config.js');
//importScripts('../jspm_packages/system.js', '../config.js');

onmessage = function() {
  System.import('./update')
  .then(function(m) {
    console.log('Yes');
    // Works for named exports.
    var x = new m.Foo();
    // Works for the defaukt export using the 'default' property.
    var y = new m.default();
  })
  .catch(function(error) {
    console.error(error)
  });
};