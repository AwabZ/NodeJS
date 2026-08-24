// worker.js (The thread code)
setTimeout(() => {
  console.log("5 Seconds Have Passed");
}, 5000);







// Communicatio Between Two Threads:

// worker.js (The Worker Thread)
const { parentPort } = require('worker_threads');

// 1. Listen for data coming from the main thread
parentPort.on('message', (messageFromMain) => {
  console.log('Worker received:', messageFromMain);

  // 2. Do the heavy work using the sent data
  const resultData = messageFromMain.data + '_PROCESSED';

  // 3. Send the final result back to the main thread
  parentPort.postMessage(resultData);
});


