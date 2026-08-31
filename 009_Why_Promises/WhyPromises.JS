
// Synchronous fantasy code
const Final_Hash = calculateHashSync("HashedEvidenceFile.pdf"); 
logAuditTrail(Final_Hash); // This line depends on evidenceHash


// Asynchronous reality
const FinalHash = calculateHashAsync("HashedEvidenceFile.pdf"); 
logAuditTrail(FinalHash); // BUG! FinalHash is undefined!



// The internal implementation (The Trap)
const ipCache = {};

function getWebsiteIP(url, callback) {
    if (ipCache[url]) {
        // SCENARIO A: The URL is in the RAM cache. 
        // We execute the callback immediately (Synchronously)
        callback(ipCache[url]); 
    } else {
        // SCENARIO B: The URL is not cached.
        // We ask libuv to do a DNS lookup (Asynchronously)
        dns.lookup(url, (err, address) => {
            ipCache[url] = address;
            callback(address);
        });
    }
}



function getWebsiteIPSafe(url) {
    return new Promise( (resolve, reject) => {
        if (ipCache[url]) {
            resolve(ipCache[url]);
        }
        else {
            dns.lookup(url, (err, address) => {
                if (err) {
                    reject(err);
                }
                else {
                    ipCache[url] = address;
                    resolve(address);
                }
            });
        }
    });
}


url = "https://target.com";

console.log("1. Initializing AEGIS Container");
getWebsiteIPSafe(url).then( (ip) => {console.log("2. Connecting To", ip)} );
console.log("2. Synchronous Setup Complete");

