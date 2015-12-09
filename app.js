//const worker = new Worker('loader.js');
const worker = new Worker('down/loader.js');

worker.onmessage = ev => {
  console.log(ev);
  worker.terminate();
};
worker.postMessage(null);