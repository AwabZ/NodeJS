// A central in-memory registry holding all active user sessions
const activeTunnels = new Map();

// The server listens. When ANY user connects, this event fires dynamically.
wssServer.on('connection', (socket, request) => {
    // 1. Extract authenticated identity (from JWT)
    const userId = getUserIdFromRequest(request);

    // 2. Dynamically allocate an isolated instance for THIS specific user
    const userTunnel = new Tunnel(userId, socket);

    // 3. Register the instance in memory: Map(Key: userId -> Value: userTunnel)
    activeTunnels.set(userId, userTunnel);
    console.log(`Active users online: ${activeTunnels.size}`);

    // 4. Handle this user's isolated data stream
    userTunnel.on('data', (packet) => {
        // Forward packet exclusively to this user's isolated Docker container
        containerStream.write(packet); 
    });

    // 5. Automatic Cleanup on disconnect
    socket.on('close', () => {
        userTunnel.cleanup();
        activeTunnels.delete(userId); // Removed from memory
        console.log(`User ${userId} disconnected. Remaining: ${activeTunnels.size}`);
    });
});




function getUserIdFromRequest(request){
    // What getUserIdFromRequest(request) is actually doing under the hood:
    const authHeader = request.headers['authorization']; // Looks like: "Bearer eyJhbGciOi..."
    const jwtString = authHeader.split(' ')[1]; // Extracts just the token
    const decodedPayload = verifyAndDecode(jwtString); // Verifies the token
    const userId = decodedPayload.userId;
    return userId;
}







