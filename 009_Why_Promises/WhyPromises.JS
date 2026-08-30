
// Synchronous fantasy code
const Final_Hash = calculateHashSync("HashedEvidenceFile.pdf"); 
logAuditTrail(Final_Hash); // This line depends on evidenceHash


// Asynchronous reality
const FinalHash = calculateHashAsync("HashedEvidenceFile.pdf"); 
logAuditTrail(FinalHash); // BUG! FinalHash is undefined!


