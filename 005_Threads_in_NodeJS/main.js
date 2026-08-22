// main.js (The Main Thread)
const { Worker } = require('worker_threads');

// We spawn two completely separate worker threads
const worker1 = new Worker('./worker.js');
const worker2 = new Worker('./worker.js');




// main.js
app.get('/heavy-code', (req, res) => {
  // Heavy math loop that takes 5 seconds of pure CPU grinding
  for(let i = 0; i < 10_000_000_000; i++) {} 
  res.send("Done");
});


