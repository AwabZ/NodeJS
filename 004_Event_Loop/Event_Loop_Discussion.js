
// How a library author implements a custom single-task function
function checkDatabaseUserLimit(userId, callback) {
    // 1. Offload heavy DB query to background libuv worker
    internalCplusplusDbQuery(userId, function(rawDbError, dbRowResult) {
        if (rawDbError) {
            // 2. Execute the user's callback passing the error
            callback(rawDbError, null);
        }
        
        // 3. Execute the user's callback passing the successful result
        callback(null, dbRowResult.limitExceeded);
    });
}

// How YOU call that function:
checkDatabaseUserLimit('user_123', function(err, isExceeded) {
    if (err) {
        console.error("Database query failed");
        return;
    }
    console.log("Is limit exceeded?", isExceeded);
});

