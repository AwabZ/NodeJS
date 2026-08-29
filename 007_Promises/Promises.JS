// THE OLD WAY (Error-First Callback)
function readEvidenceFile(callback) {
    fs.readFile('aegis.txt', (err, fileData) => {
        if (err) {
            return callback(err, null); // We pass the error first
        } else {
            return callback(null, fileData); // We pass null for error, then the data
        }
    });
}


// THE OLD WAY (Consuming)
readResult = readEvidenceFile((err, data) => {
    if (err) {
        console.log("Failed:", err);
    } else {
        console.log("Success:", data);
    }
});



// THE PROMISE WAY (The Producer)
function readEvidenceFilePromise() {
    return new Promise((resolve, reject) => {
        
        fs.readFile('aegis.txt', (err, fileData) => {
            if (err) {
                reject(err); // Replaces callback(err, null)
            } else {
                resolve(fileData); // Replaces callback(null, fileData)
            }
        });

    });
}


// THE PROMISE WAY (Consuming)
const myPromiseReceipt = readEvidenceFilePromise();

// We use .then() to pass the success callback
myPromiseReceipt.then((data) => {
    console.log("Success:", data);
});

// We use .catch() to pass the error callback
myPromiseReceipt.catch((err) => {
    console.log("Failed:", err);
});





