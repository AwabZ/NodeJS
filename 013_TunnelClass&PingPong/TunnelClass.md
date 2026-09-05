## Tunnel Class Sensing Incoming Messages:
- We've already discussed this before; We'll be defining our very own `Tunnel` class because using the provided Special Object `wsClient` Socket From NodeJS right away will not be sufficient due to the extra properties that we want to tie in to the Tunnel itself. 
- However, our `Tunnel` class is just a Custom Class of ours, there's nothing special about it. This means that whenever we define and instantiate it, **a `Tunnel` object won't be a Special Object. Special Objects Are Given To Us By NodeJS and They Are Integrated On The Operating System Level. This Means That our `Tunnel` Objects Will NOT be able to Natively and Naturally Listen Into and Acquire Incoming Packets That Hit The WebSocket.**
- Remember our solution to this was the fact that **The Constructor Of The Tunnel Class Would Take In The Special Object `wsClient` Socket:

 - The `wsClient` Socket is originally Provided By The `wss.handleUpgrade()` function
 - Emit `connection` event within that `handleUpgrade()` callback through the `wss.emit("connection")` function, passing `wsClient` as an argument.
 - which makes the `wss.on("connection")` listener receive the `wsClient`, then it instantiates a `userTunnel = new Tunnel(wsClient, userID)` Tunnel Object.

- Basically:

```JS
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server( { server });

server.on("upgrade", (request, rawTcpSocket, head) => {
    // Verify the JWT from the request.body here.
    wss.handleUpgrade(request, rawTcpSocket, head, (wsClient) => {
        wss.emit("connection", wsClient, request);
    });
});

wss.on("connection", (wsClient, request) => {
    //...........
    userTunnel = new Tunnel(wsClient, userID);
    userTunnel.on("evidence", (evidencePacket) => {
        //...................
    })
});
```

- What we are targeting here is that `userTunnel.on("evidence")` line right at the very end. We want to make the Custom `Tunnel` Class Object Able To Sense These `message` events the same way a `wsClient` WebSocket would, to sense every packet that arrives to this specific Socket and React On That Event. (Note that here, purely for cosmetics, we've renamed the `message` event to be called the `evidence` event for the Custom Tunnel Class. We'll see how that's done later).

- As we've previously discusseed, **The Tunnel Class Constructor Will Be Setup In Such A Way That Whenever The Received Special `wsClient` WebSocket Object Senses the `message` Event: `wsClient.on("message", (evidencePacket) => {..})`, in its callback, the Tunnel object will immediately emit an `evidence` event and pass that same `evidencePacket`. 

```JS
this.wsClient.on("message", (evidencePacket) => {
    this.emit("evidence", (evidencePacket));
});
```

- This way, whenever the `wsClient` Special Object senses an incoming Packet and emits the `message` event, the `Tunnel` object that received this `wsClient` will also now emit and therefore sense the `evidence` event and take in that same `evidencePacket`. Now, we have given our custom `Tunnel` class this same Special Object ability while having all the extra properties that we would want the `Tunnel` to have:
- Obviously, for the `Tunnel` class to be able to emit and listen to any events, it will have to `extend` the `EventEmitter` class.


```JS
const EventEmitter = require("events");

class Tunnel extends EventEmitter {
    constructor(userID, wsClient) {
        super();
        this.userID = userID;
        this.wsClient = wsClient;

        this._initializeTunnel();
    }

    _initializeTunnel(){
        this.wsClient.on("message", (evidencePacket) => {
            this.emit("evidence", evidencePacket);
        });

        this.wsClient.on("close", () => {
            this.cleanup();
            this.emit("disconnected", this.userID);
        });

        this.wsClient.on("error", (err) => {
            console.log(`Tunnel ${this.userID} Error: ${err.message}`);
            this.cleanup();
        });
    }

    cleanup(){
        this.wsClient.removeAllListeners();
    }
}

module.exports = Tunnel;
```

- Now, you can write this:

```JS
const activeTunnels = new Map();

wss.on('connection', (wsClient, request, decodedUser) => {
    const userId = decodedUser.id;
    
    // Allocate the isolated Tunnel object
    const userTunnel = new Tunnel(userId, wsClient);
    activeTunnels.set(userId, userTunnel);

    // Listen to our custom 'evidence' event
    userTunnel.on('evidence', (encryptedPacket) => {
        // Hand off to the Decryption/SHA-256 Pipeline
    });

    userTunnel.on('disconnected', () => {
        activeTunnels.delete(userId);
    });
});
```

## Getting The UserID From The Login `app.post("/api/login")` To The Tunnel Class:
- Look at this code above and you'll see that the `wss.on("connection", (wsClient, request, decodedUser) => {..})` function that we have has this `decodedUser` parameter. 
- As we've seen, we want to pass the `userID` to the objects of the `Tunnel` class. You might think that the `request` object that we passed into `wss.on("connection")` may have the `UserID` inside of it but traditionally it actually doesn't. 
- Recall that this `request` object originally comes from the `server.on("upgrade", (request, rawTcpSocket, head) => {...})` event. So, it's the HTTP GET Request from the Client Side that has the `Connection: Upgrade` header in it. This is the very last HTTP-type object that we receive from the user before establishing the Tunnel and switchin Protocols to WebSocket. This is how this `request` object looks:

``` HTTP
GET / HTTP/1.1
Host: aegis.server.com
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

- As you can see, it doesn't have the username or userID or anything, but here's the thing, when you use the `jwt.verify()` function from the `jsonwebtoken` package, and you call it Synchronously (No callback provided), upon success, it actually **returns the decoded payload object. Recall that the JWT is `EncodedHeader.EncodedPayload.Signature`. So, it will actually DECODE The Payload (which originally had the ID of the User in a JSON) and return that.**

- So, we can Verify the JWT and obtain the `UserID` simultaneously. Then, we simply pass that as a Custom Parameter when emitting the `connection` event:

```JS
const jwt = require('jsonwebtoken');

server.on("upgrade", (request, socket, head) => {
    const token = request.headers["Authorization"];
    const decodedUser = jwt.verify(token, SECRET_HASH_FUNCTION);

    wss.handleUpgrade(request, rawTcpSocket, head, (wsClient) => {
        wss.emit("connection", wsClient, request, decodedUser);
    });

});

wss.on("connection", (wsClient, request, decodedUser) => {
    const userID = decodedUser.id;
})
```


## The Heartbeat Ping/Pong "Keel-Alive Logic":
- Firewalls drop TCP connections if they sit idle for too long. Unfortunately, `ws` is too pure and bare-metal so it doesn't automatically have this type of "Keep-Alive Logic" where very small synthetic "Ping" messages and "Pong" responses are passed through the Tunnel for it not to remain idle. So, we sort of have to implement it ourselves and manually send these heartbeat frames. Fortunately, it's not that difficult.

- If a WebSocket is left open, intermediate routers will assume the connectio nis dead and silently drop it. Neither the Server nor the Electron App will know the connection is dead until one of them tries to send data to the other and crashes.

- Fortunately, the `WebSocket Protocol (RFC 6455)` has dedicated, invisible control frames called `PING` and `PONG` made specifically for this. Yes, a `wsClient` special object is able to distinguish between actual packets and these `PING` and `PONG` packets to the extent that there exists a distinct `pong` event that you can listen to whenever the client replies with a `PONG` to your `PING`:

```JS
// This native "pong" even fires when the client replies to the server's "ping"
this.wsClient.on("pong", () => {
    this.isAlive = true; // More on this later
});
```

- In fact, to send a `PING` packet, all you need to do is to use the WebSocket Special Object (`wsClient`) and call:

```JS
this.wsClient.ping();
```

- Obviously, we'll want to set it up so that this `PING` Happens every so often in a set interval. Let's say that this interval is every 30 seconds. Additionally, to ensure that you actually kill the `wsClient` WebSocket if a problem occurs instead of leaving it hanging, we'll setup a check, a variable (`isAlive`).

- Everytime we receive a `PONG` packet from the Client, we set this variable to true because the connection is still Alive. 
- Then, Every 30 seconds, we check if this variable is False. If true, we set it to false and then send another `PING`. The Client has 30 seconds to respond to this `PING` with a `PONG` before the next check is made.
- However, if it is false, this means that in the 30 second interval before the next check is made, the user did not respond with a `PONG`, so the connection is most probably dead. At that point, we kill the WebSocket: `this.wsClient.terminate();`
- How do we setup these intervals? With our trusted `setInterval(callback, ms)` whose `callback` will include all of these checks and after the Timer is Over, the `callback` will execute during the Timer Phase.

```JS
_initializeTunnel() {
        // 1. The native 'pong' event fires when the client replies to our ping
        this.ws.on('pong', () => {
            this.isAlive = true; 
        });
        // ....................
        // ....................
}


_startHeartBeat(){
    // Ping the Electron App Every 30 Seconds.
    this.heartBeatInterval = setInterval( () => {
        if(this.isAlive === false){
            // This client missed the last ping. The connection is dead.
            return this.wsClient.terminate(); // Kill The Socket.
        }
        // Assume dead until proven alive by the next "pong" that sets it to true
        this.isAlive = false;
        this.wsClient.ping(); // Send the `PING`
    }, 30000); // Every 30 seconds (30,000 milliseconds)
}


cleanup(){
    clearInterval(this.heartbeatInterval);
    this.wsClient.removeAllListeners();
}
```

- Obviously, in the event that the connection is closed or crashed with an error, whenever we do the `cleanup()`, we want to also kill this interval timer as it actually goes on indefinitely if not explicitly and manually killed with `clearInterval()`. This is why we assign a name (`heartbeatInterval`) to it.


- So far, this is how the `Tunnel` Class Looks:

```JS
const EventEmitter = require("events");

class Tunnel extends EventEmitter {
    constructor(userID, wsClient) {
        super();
        this.userID = userID;
        this.wsClient = wsClient;

        this._initializeTunnel();
        this._startHeartbeat();
    }

    _initializeTunnel(){
        this.wsClient.on("pong", () => {
            this.isAlive = true;
        });

        this.wsClient.on("message", (evidencePacket) => {
            this.emit("evidence", evidencePacket);
        });

        this.wsClient.on("close", () => {
            this.cleanup();
            this.emit("disconnected", this.userID);
        });

        this.wsClient.on("error", (err) => {
            console.log(`Tunnel ${this.userID} Error: ${err.message}`);
            this.cleanup();
        });
    }

    startHeartbeat(){
        this.heartbeatInterval = setInterval( () => {
            if(this.isAlive === false){
                return this.wsClient.terminate();
            }
            
            this.isAlive = false;
            this.wsClient.ping();
        }, 30000);
    }

    cleanup(){
        this.wsClient.removeAllListeners();
        clearInterval(this.heartbeatInterval);
    }
}

module.exports = Tunnel;
```


