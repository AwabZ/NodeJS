## What is an HTTP Packet:
- The HTTP Protocol is entirely text-based. It's just a standardized format for arranging characters over a TCP Socket. 

- Every Single HTTP Message, whether it is a `request` from The Electron App or a `response` from AEGIS, follows the exact same structure:

 - 1. **The Start Line**: One Line defining what the Packet is Doing. It contains the Method (How The Request is Sent and Treated) and the URL Path (The endpoint destination)
 - 2. **The Headers**: Key-Value pairs defining metadata (each separated by a newline). For example, this includes: `Authorization: Bearer <Token>` and `Upgrade: websocket`.
 - 3. **The Blank Line**: A mandatory empty line to indicate the Header section is finished.
 - 4. **The Body (Optional)**: The actual data transfered to the receiving end (e.g., JSON Data, binary files, HTML text): `{"username":"awab", "password": "123"}`.

`EX: Request(Electron -> AEGIS)`:

```HTTP
POST /api/login HTTP/1.1
Host: aegis.server.com
Content-Type: application/json
Content-length: 42

{"username": "awab", "password": "123"}
```

- The Server Receives the request, processes it, and replies with its own HTTP Object. 
 - **The Status Code**: A 3-digit Summary of the outcome. `200` means OK, `401` means Unauthorized, and `500` means Server Error.
 - **The Headers**: Metadata Describing the reply.
 - **The Body**: The actual data returned to the client (e.g., the JSON string containing the JWT: `{"token": "eyHjbGci..."}`). Once the response is sent, if you're using standard HTTP/1.0, the OS destroys the TCP connection immediately. However, if you're using the Persistent HTTP/1.1 Protocol, it is kept alive because more requests and responses are expected.

`EX: Response (AEGIS -> Electron)`:

```HTTP
HTTP/1.1 200 OK 
Content-Type: application/json
Content-length: 68

{"status": "success", "token": "eyJhbGci....."}
```

### GET vs. POST (Methods For Requests):
- The Start Line of a Request always begins with a "Method". These methods tell the server how to treat the incoming TCP Packet.

- **Purpose**:
 - `GET Request`: Asking the server to send you data (Read). You literally want to GET data. You are Requesting the server to get something from it. 
 - `POST Request`: Sending Data to the Server to be processed/stored (Write). You literally want to POST data. You are requestint the server to send something to it.

- **The Body**:
 - `GET Request`: Empty Body. You are requesting data, not sending it. You cannot put a JSON Payload in a GET Request.
 - `POST Request`: Here, you must have a Body with data in it. This is where things like login credentials go.

- **Parameters**:
 - `GET Request`: Any Parameters are appended to the URL as a Query String (e.g., `/search?query=AI`), which is visible in the logs (less secure).
 - `POST Request`: Parameters are Hidden In The Body Of The Request. Secure for passwords when encrypted via HTTPS.

- **AEGIS Use Case**:
 - `GET Request`: The Electron App will have to initiate the Connection with the AEGIS Server through a GET Request with the `Upgrade` header to open the WebSocket Tunnel when "GatherEvidence" is clicked.
 - `POST Request`: When The User Logs in to the App, the login credentials are put in the Body of the POST Request.


## Endpoints: 
- You always setup endpoints on both sides and the Server and App communicate through these endpoints. For example, if the App sends a `POST /api/login` request, it is sending it to the `/api/login` endpoint on the Server Side. The Server should have this endpoint defined and have a listener that listens in to this specific endpoint whenever it receives a POST request with this endpoint specified. Then, as you can imagine, under this listener it sets up the `response` and sends it back. We'll see how all of this is done in code later on, but do remember that these specifics are setup in the `Start Line` of the HTTP object.

- For example, in this `POST request` that we say earlier:

```HTTP
POST /api/login HTTP/1.1
Host: aegis.server.com
Content-Type: application/json
Content-length: 42

{"username": "awab", "password": "123"}
```

- The First `Start Line` of this HTTP Object is saying: **This is a POST request meant for the /api/login endpoint and it utilizes the HTTP/1.1 Protocol specifically, which is Persistent HTTP. This lets the Server know that The Connection Pipe Will Stay Alive After It Responds To This Request.**


## Persistent HTTP (HTTP/1.1):
- When Loading a Website in HTTP/1.0, if a browser wanted an HTML file, a CSS file, and an Image to be retrieved from that website to be loaded into the browser, the OS had to perform three separate TCP 3-way handshakes, open three sockets, download the objects, and destroy the three sockets. 
 - Every single HTTP Request could only retrieve a singular object.
 - After the HTTP Response with that one object, the connection is immediately dropped and the socket is destroyed.
 - Then, another one is established through yet another handshake and a new socket is created to retrieve the second object. 
 - This repeats for every single asset (object).

- HTTP/1.1 introduced Persistent Connections (`Connection: keep-alive`). Now, the OS opens a single TCP Socket. The Client sends a `GET` request for the HTML, the server sends the HTML Response, but the TCP Socket is kept open. The client then sends the `GET` request for the CSS down the exact same pipe.
- **This Persistent TCP Pipe is the exact one that WebSockets hijack. The `Upgrade: websocket` header simply tells the server to: "Stop parsing the TCP pipe as a text-based HTTP and start reading it as raw binary frames.**


## AEGIS Listener Architecture:
- The OS Hands every single incoming Port 443 TCP Packet to the V8 engine. NodeJS runs the bytes through an internal HTTP Parser (called `llhttp`). Based on what the parser finds, NodeJS triggers completely different event listeners and invokes them.
- **Keep in Mind that the following section talks about the AEGIS Server Side of Things. How it Listens in to incoming HTTP Requests and Packets. Again, all of these things down here are listeners.**

### Express and WebSocket in AEGIS:
- You'll later notice how Express connects to the native NodeJS HTTP module in our architecture:

```JS
const express = require("express");
const http = requre("http");

const app = express(); 
const server = http.createServer(app);
```

- When you pass `app` into `http.createServer()`, you are telling Node's native HTTP server: "Whenever a standard HTTP request comes in, let Express handle the URL Routing and JSON parsing".

- However, when an HTTP request contains the `Upgrade: websocket` header, **Express never even sees it**. 
 - Such a request is only ever seen by the `server.on("upgrade")` Event-Listener. This Event intercepts the TCP socket at the raw NodeJS level BEFORE Express routes it. Express handles the mundane tasks that you would typically see in a Dashboard or CRUD app (logging in, returning JWTs, serving web pages), while pure NodeJS and `ws` handle the reverse tunnel, both of these working on the exact same 443 port.

### The Different Sockets In AEGIS:
- There are actually two entirely different types of Sockets that we deal with. **Obviously, both are special objects provided by NodeJS, but they are different**:

 - 1. `rawTcpSocket (net.Socket)`: This is the raw Operating System Network Stream. It's "dumb" per say. It is only used for HTTP-type objects, emits raw bytes chunks, and **Knows nothing about WebSockets**. 

 - 2. `wsClient (WebSocket)`: This is the smart wrapper provided by the `ws` library. **It Knows how to decode frames, unmask bytes, and emit clean messages. THIS IS THE SOCKET OBJECT WE'LL USE FOR THE TUNNEL. THIS IS THE WEBSOCKET. How do we get it? We'll see in a bit.**


### Route A: Standard HTTP (Handled By Express):
- If the parser sees a standard `POST` OR `GET` request, NodeJS emits a `request` event. Express is attached to this event. Express acts as a giant router, reading the Start Line and triggering the Correct callback. 
- This `request` event is caught by the `app.post()` and `app.get()` methods depending on whether the incoming HTTP request was a `POST` request (caught by `app.post()`) or a `GET` request (caught by `app.get()`). 
- However, these methods only listen in to `POST`/`GET` requests that come in with this specified endpoint URL. For example, if you write `app.post("/api/login", ...)`, this listener will only listen in to incoming POST requests that specifically, in their `Start Line`, mention, and target, the `/api/login` endpoint (URL) specifically. 
- **So, you have to set it up such that when the Client Electron App Sends a POST Request To The Server For The Sake Of Logging In, In Sends That POST Request with a `POST /api/login HTTP/1.1` "Start Line".** 


```JS
const app = express(); 
const server = http.createServer(app);
// Electron App Sends a POST request with the JSON Body Of Credentials To Login:
app.post("/api/login", (request, response) => {
    // 1. request.body contains the JSON
    // 2. We verify the user and create the JWT
    // 3. response.json() builds the HTTP Response Packet and sends it back

});
```

- As you'd expect, when this event is caught, the callback `(request, response) => {...}` is sent to the Macro-Task Queue and executed during the Poll Phase Of The Event Loop.
- `request`: The object containing everything the client sent over (the URL, the Headers, the pased JSON Body for the payload). We read the incoming request and its provided data from this object.
- `response`: This is a blank **special object** (much like the `socket` object we discussed previously) provided by NodeJS. **It Represents The Reply Your are Going to Send. You "fill it up" by calling `response.status(200).json({...})`, and Express automatically fires it back down the TCP Socket to the Client.**
- Notice that we specifically say `app.post()` and `app.get()` so that Express is the one managing these boring standard HTTP operations like Logins, as this is what it was designed for.



### Route B: The Upgrade Request (Handled By `http` Natively):
- If the parser sees the `Connection: Upgrade` header, NodeJS bypasses Express entirely. An `upgrade` event is emitted that is caught by `server.on("upgrade")`"

```JS
const app = express(); 
const server = http.createServer(app);
// Electron App sends a GET request with the Upgrade and Authorization Headers:
server.on("upgrade", (request, rawTcpSocket, head) => {
    // 1. We Extract The JWT from request.headers['authorization']
    // 2. We verify the JWt
    // 3. If valid, we'll have to call the `wss.handleupgrade()` function to upgrade this `rawTcpSocket` into a WebSocket. NOTICE HOW YOU ONLY CALL THIS WHEN THE JWT IS VALIDATED TO NOT ESTABLISH A TUNNEL.
})
```

- Again, this will ONLY catch requests that have a `Connection: Upgrade` Header on them, and such requests are absolutely invisible to Express and it does not react to them. 
- As you may expect, the `(request, socket, head) => {...}` callback is sent to the Macro-Task (Poll) Queue whenever this event is caught (Whenever an HTTP Request with a `Connection: Upgrade` header arrives). 

- `request (http.IncomingMessage Object)`: The object containing everything the client sent over (the URL, the Headers, the pased JSON Body for the payload). We read the incoming request and its provided data from this object. Since this would be a GET request (No data is being sent over from the Client, it's just a request to establish the Tunnel), then there is no body to the request object. However, we do extract the `request.headers["authorization"]` to verify the JWT Token from here.

- `rawTcpSocket (net.Socket Object)`: **This is a Special Object Provided by NodeJS. It's the reference to the Socket Used To Communicate With That Specific User with these Responses and Requests. Howeverr, notice that NodeJS has handed you a `rawTcpSocket`, the "dumb" TCP wire, not a WebSocket. This `socket` object will have to get upgraded into a WebSocket (After the JWT is validated) using the `wss.handleUpgrade()` function.**

- Notice how there is no `response` special object here because the Server has nothing to respond to. From this point and forward (after the JWT is verified), HTTP is dead and we no longer work with request and response HTTP objects. **Additionally, if you want to reject the connection (say, the JWT was invalid), you cannot just call `response.status(401)` because there is no `response` object. So, you must write raw HTTP with the `Start Line` and the `401 Unauthorized`  
directly through this `socket` and then destroy it:

```JS
socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
socket.destroy();
```

- `head (Buffer Object)`: This is a binary Buffer containing any bytes that arrived over the TCP stream immediately after the HTTP headers. In most cases (and probably our case too), `head.length === 0` because **usually the client sends the headers and waits for the `101 Switching Protocols` response (which only happens after `handleUpgrade()` is called) before sending the Frames containing Data**. However, if an aggressive client pipelines data (Sending the first WebSocket Frame immediately after the HTTP headers of the `upgrade` request in the exact same TCP packet), those trailing bytes sit in `head`. We send these trailing bytes of the `head` Buffer to `wss.handleUpgrade()` to handle.


### Route C: The Tunnel (Handled By `ws`):

#### Handling The Upgrade:
- As discussed, in the `server.on("upgrade", (request, rawTcpSocket, head) => {..})` callback, if we find that the JWT is valid, then we call `wss.handleUpgrade` right inside its callback. This is an incredibly important function. It takes in `(request, rawTcpSocket, head)` and literally handles the whole upgrading process for you. 
 - **It Writes The HTTP/1.1 `101 Switching Protocols` packet back to the client over the given `rawTcpSocket`.**
 - **It takes that "Dumb" `rawTcpSocket`, wraps it in a brand new, "smart" `WebSocket` instance (`wsClient`).**
 - **It passes The New Special Object WebSocket (`wsClient`) To Its Callback Function. THERE IT IS. THIS IS THE WEBSOCKET.**

```JS
const server = http.createServer(app);
const wss = new WebSocket.Server( { server }); /* This Line Creates Our WebSocket Server. It makes it so that server.on("upgrade") gets hi-jacked by the WebSocket wss object, bypassing both the http and express modules. */

wss.handleUpgrade(request, rawTcpSocket, head, (wsClient) => {
    wss.emit("connection", wsClient, request);
});
```

- **As soon as this `handleUpgrade` function is called, the Bi-Directional WebSocket Tunnel is fully established, and the `wsClient` object is the WebSocket That Can Sense and Listen In To Every Single Incoming Packet Flowing Through This Tunnel Meant For This Specific User.**
- Notice how inside this callback, we emit the WebSocket server's `connection` event. Why do we do this? So we can do this later:

```JS
wss.on("connection", (wsClient, request) => {
    // You can now throw `rawTcpSocket` into the trash. You never use it again. 
    // You only talk to wsClient from now on.
    wsClient.on("message", (evidencePacket) => {
        // Raw Evidence Arriving Through The Tunnel!!!!
    })
});
```

- When `wss.on("connection")` is invoked, this means that everything beforehand (The Logging In, Upgrade Request, JWT Check, Upgrade Process, and Tunnel Setup) have all gone successfully. **Now, you can use this `wsClient` Special WebSocket Object, and every single time an Evidence Packet Arriving From This Specific User Hits The Server, This Special Object Senses It Through The `message` Event, and You Can Do Whatever You Want With These Evidence Packets** 


- **HTTP Bodies (Requests/Responses) Are Static, one-time Payloads of text or JSON. You use Express to parse them during the `/api/login` phase and while setting up the JWT Token**.
- **WebSocket Streams have absolutely nothing to do with HTTP Requests and Responses. Once the `101 Switching Protocols` handshake occurs, HTTP is dead. The continuous evidence flowing through the tunnel has no URLs, no Methods, and no HTTP Bodies. IT IS JUST RAW BINARY FRAMES firing repeatedly over the raw TCP pipe.**


## Handshake Abstraction:
- The very neat thing is that under all of this, there are actually two handshakes occuring that are just entirely abstracted away from us by these libraries.

### The TCP Handshake (Layer 4 - Transport):
- This is pure physical networking happening between the two operating systems (Of the Client and Server). The Electron PC sends a tiny packet called `SYN`, the server replies with `SYN-ACK`, and the PC replies with `ACK`.
 - No Username, no password, no HTTP, no data.
 - This is just the two network cards (NIC) agreeing: "We can hear each other".
 - This emits a type of event called `http.Server.on("connection", ...)`, a type of `connection` event different from the WebSocket one.

### The HTTP Login (Layer 7 - Application):
- This isn't really a Handshake at all but it is a noteworthy exchange of information because it happens between two distinct handshakes. 
- This happens after the TCP handshake. Now that the wire is open, the Electron app sends text down that wire through `POST /api/login` with your username and password.
 - This is fully handled by us by utilizing the `app.post("/api/login")` handles.

### The WebSocket Handshake (Layer 7 Protocol Upgrade):
- This is an HTTP `GET` request sent down that same wire with a `Connection: Upgrade` header. 
 - We also handle this by just using `server.on("upgrade")`



## How The Electron App Sends Requests To The AEGIS Server:
- We Now Need To See The Code That runs inside the Electron AEGIS App that actually triggers those Server-Side Listeners.
- **Modern JavaScript Uses a Native Global Function called `fetch()` to Construct and Send HTTP Packets.**

```JS
async function loginToAegis(username, password){
    // 1. Construct The Body:
    const loginData = {
        username: username,
        password: password
    };

    // 2. Use `fetch()` to send the HTTP POST Packet
    const serverReply = await fetch("https://aegis.server.com/api/login", {
    method: "POST",
    headers: {
        "Content-Type": "application/json" // Tells The Server To Expect JSON.
    },
    body: JSON.stringify(loginData) //Converts The JS `loginData` object into text Body. 
    });

    // 3. Wait for the server's HTTP Response and Parse The JSON into a JS Object
    const responseBody = await serverReply.json();

    // 4. Extract The JWT Token:
    if (responseBody.status === "success"){
        console.log(`JWT is: ${response.Body.token}`);
        return responseBody.token;
    }
    /* Note That This is The JWT Returned To The App By The Server. We don't really
    need to extract it for any reason but this is just a demonstration. */
}
```

- Here's how the two sides connect:
 - 1. Electron executes the `fetch()` function. The OS builds the exact text packet we wrote (`POST /api/login HTTP/1.1 ....`) and shoots it across the internet.
 - 2. The AEGIS Server receives the TCP Packet. Express parses it and trigers the `app.post("/api/login", (request, response) => {....})` listener.
 - 3. The AEGIS Server reads `request.body.username`, verifies the password from the DB, creates the JWT, and calls `response.json({ token: ...})`
 - 4. Electron's `await fetch()` finishes, and it receives the token to save in the memory of the session.
