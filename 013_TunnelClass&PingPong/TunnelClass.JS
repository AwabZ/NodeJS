const EventEmitter = require('events');

class Tunnel extends EventEmitter {
    constructor(userId, wsClient) {
        super();
        this.userId = userId;
        this.ws = wsClient;
        this.isAlive = true; // Heartbeat state

        this._initializeTunnel();
        this._startHeartbeat();
    }

    _initializeTunnel() {
        // 1. The native 'pong' event fires when the client replies to our ping
        this.ws.on('pong', () => {
            this.isAlive = true; 
        });

        // 2. Catch incoming binary data and emit it to the Orchestrator
        this.ws.on('message', (data) => {
            this.emit('evidence', data);
        });

        // 3. Handle network collapse
        this.ws.on('close', () => {
            this.cleanup();
            this.emit('disconnected', this.userId);
        });

        this.ws.on('error', (err) => {
            console.error(`[Tunnel ${this.userId}] Error:`, err.message);
            this.cleanup();
        });
    }

    _startHeartbeat() {
        // Ping the Electron app every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.isAlive === false) {
                // The client missed the last ping. The connection is a zombie.
                console.log(`[Tunnel ${this.userId}] Heartbeat failed. Terminating.`);
                return this.ws.terminate(); // Violently sever the TCP socket
            }

            // Assume dead until proven alive by the next 'pong'
            this.isAlive = false; 
            this.ws.ping(); // Send the lightweight control frame
        }, 30000);
    }

    // A public method for the Orchestrator to push encrypted data DOWN the tunnel
    sendEncryptedPayload(binaryBuffer) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(binaryBuffer);
        }
    }

    cleanup() {
        clearInterval(this.heartbeatInterval);
        this.ws.removeAllListeners();
    }
}

module.exports = Tunnel;