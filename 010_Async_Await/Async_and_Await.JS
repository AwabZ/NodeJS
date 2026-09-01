// THE PRODUCER: Wraps the background libuv task (No changes needed)
function verifyUserDBPromise(userID) {
    return new Promise((resolve, reject) => {
        // The background DB query. Offloaded to libuv.
        DBQueryCheck(userID, (err, userData) => {
            if (err) reject(err);
            else resolve(userData); 
        });
    });
}

// THE CONSUMER: The Event-Driven Reactor (Rewritten with async/await)
wssServer.on("connection", async (socket, request) => {
    
    const userID = request.headers['user-id']; 
    
    try {
        // V8 hits 'await'. It calls the Producer, gets the Promise, 
        // freezes this function, and packages everything below into a hidden callback.
        const userData = await verifyUserDBPromise(userID);

        // This is secretly the .then() block. It runs later in the Micro-Task Queue.
        console.log("DB check passed. Establishing AEGIS WSS Tunnel for:", userData.id);
        aegisMap.set(userData.id, socket);

    } catch (error) {
        // This is secretly the .catch() block. It runs if reject(err) is called.
        socket.close();
    }
});






// LAYER 4: The Producer (Raw C++ boundary)
function dbDriver(userID) {
    return new Promise((resolve) => { /* libuv background work */ });
}

// LAYER 3: The DB Service (Consumer of Layer 4, Producer for Layer 2)
async function dbService(userID) {
    const rawData = await dbDriver(userID); // Suspends here
    return { name: rawData.name, role: "Admin" }; // This return auto-resolves Layer 2's Promise
}

// LAYER 2: The Auth Controller (Consumer of Layer 3, Producer for Layer 1)
async function authController(userID) {
    const userObj = await dbService(userID); // Suspends here
    if (userObj.role !== "Admin") throw new Error("Denied");
    return userObj; // This return auto-resolves Layer 1's Promise
}

// LAYER 1: The Route Handler (Top-level Event Loop callback)
app.get("/login", async (req, res) => {
    try {
        const finalUser = await authController(req.body.id); // Suspends here
        res.send("Success"); // We finally send the data back to the client
    } catch (err) {
        res.status(500).send(err.message);
    }
});


