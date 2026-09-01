// THE PRODUCER: Wraps the background libuv task
function verifyUserDBPromise(userID) {
    return new Promise((resolve, reject) => {
        // The background DB query. Offloaded to libuv.
        DBQueryCheck(userID, (err, userData) => {
            if (err) reject(err);
            else resolve(userData); 
        });
    });
}

// THE CONSUMER: The Event-Driven Reactor
wssServer.on("connection", (socket, request) => {
    
    const userID = request.headers['user-id']; 
    
    // We call the Producer. The DB starts working in the background.
    const authReceipt = verifyUserDBPromise(userID);


    authReceipt.then((userData) => {

        console.log("DB check passed. Establishing AEGIS WSS Tunnel for:", userData.id);
        aegisMap.set(userData.id, socket);
    }).catch((error) => {
        socket.close();
    });
});




