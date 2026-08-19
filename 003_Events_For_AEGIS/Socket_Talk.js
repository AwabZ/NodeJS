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
    userTunnel.on('close', () => {
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




// Tunnel Class Definition:

const EventEmitter = require('events');

class Tunnel extends EventEmitter {
    constructor(userId, socket) {
        super(); // Initializes the custom EventEmitter memory block
        this.userId = userId;
        this.socket = socket; 

        // THE MAPPING:
        // We listen to the raw OS socket. When IT receives data...
        this.socket.on('data', (Packet) => {
            
            // ...we tell OUR custom Tunnel object to emit that same data.
            this.emit('data', Packet); 
            
        });

        this.socket.on('error', (err) => {
            this.emit('error', err);
        });

        this.socket.on('close', () => {
            this.emit('close');
        });
    }

    cleanup() {
        // Custom method to physically kill the network connection when done
        this.socket.destroy(); 
    }
}






