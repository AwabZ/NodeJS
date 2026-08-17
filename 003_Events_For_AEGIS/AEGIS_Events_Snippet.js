// ----- Emitted Events are not Global -----:

const tunnelUser1 = new TunnelProxy();
const tunnelUser2 = new TunnelProxy();

tunnelUser1.on('data', (packet) => {
    // 100% Certainty: This packet belongs exclusively to User 1.
});



// ----- Singleton Pattern -----:

// File 1: eventBus.js
const EventEmitter = require('events');

class GlobalEventBus extends EventEmitter {}

// Crucial: We export an INSTANCE of the class, not the class definition itself.
const busInstance = new GlobalEventBus();
module.exports = busInstance;


// File 2: auditLogger.js
const globalBus = require('./eventBus'); // Receives the cached instance

// Listen for global audit events anywhere in the app
globalBus.on('security_alert', (message) => {
    console.log(`[AUDIT LOG ENTRY]: ${message}`);
});


// File 3: authController.js (This is the one Emitting the Global Events)
const globalBus = require('./eventBus'); // Receives the EXACT SAME cached instance

function handleFailedLogin(ipAddress) {
    // Emitting on this instance triggers the listener registered in auditLogger.js
    // and even passes that error message to the "message" parameter of the function
    globalBus.emit('security_alert', `Failed login attempt from IP: ${ipAddress}`);
}



// How Event Listening and Event Executing are Different:

// The Callback function in the AEGIS reverse Tunnel:
userTunnel.on('data', (packet) => {
    // Forward this packet to the Docker container
    containerStream.write(packet); 
});



// How Multiple Users are Handled In EventListeners

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
