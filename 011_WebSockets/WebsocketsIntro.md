## Why Not Socket.io?
- `Socket.io` is a pretty nice library that makes things much easier to work with. However, `Socket.io` is a bloated abstraction layer built for chat applications and real-time dashboards.
- The biggest reason as to why it won't be used for AEGIS is that it **injects framing bytes into your packets, which makes the Evidence, in some way, tampered with and un-pure**.
- In AEGIS, we need absolute certainty over every single packet that travels between the User Client App and the Headless Chrome On The Server. If a packet is hashed for evidence, you just can't have a library that secretly appends metadata to the binary stream.
- We must use Pure WebSockets through the `ws` package in NodeJS, which acts as a near-transparent wrapper over the raw TCP socket.

## What is a WebSocket?
- WebSockets are not their own unique internet protocol. They are essentially a "parasite" that hijacks a standard TCP/HTTP connection. Because Firewalls block almost everything except ports 80 (HTTP) and 443 (HTTPS), WebSockets were desgined to disguise themselves as standard web traffic to bypass firewall security.

### Standard HTTP Limitations:
- Standard HTTP is a **Request-Response** protocol. It is **Half-Duplex**.
- The Client (A Browser or the AEGIS Electron App) sends a Request, the Server computes a Response, sends it back, and then the OS kills the TCP connection. 
- With HTTP, if the AEGIS Server wants to tell the Electron App to "Start Gathering Evidence", it simply cannot. In the HTTP Protocol, a server cannot speak unless spoken to.
- A WebSocket solves this by creating a **Full-Duplex** connection. Once established, both the client and the server can shove binary data down the pipe in both ways simultaneously at any time without waiting for a request, and the connection can stay persistently alive for a long period of time.

### How The Tunnel Will Be Setup To Avoid The Firewall:
- The Absolute Core of the Entire AEGIS Architecture is the fact that **The User Client App Will Be The One Initiating The Connection, Not The AEGIS Server.**
- Network firewalls operate on this rule where that essentially says: **Deny all incoming traffic, allow all OUTGOING traffic.**

#### InBound vs Outbound Connections:
- From The Prespective Of The Client-Side:
 - InBound Connection: **Type Of Connection Where The Client Device is the one RECEIVING traffic from an external source (Such as the AEGIS Server).**
 - OutBound Connection: **Type Of Connection Where The Client Device is the one SENDING OUT traffic to an external source (Client Electron App Sending To AEGIS Server).**

- Here's the thing, Firewalls are much more sensitive about InBound Connections. They always certainly allow you to send out traffic through an OutBound connection that YOU establish, but if an external source attempts to establish an InBound Connection with you to send YOU traffic, then the Firewall immediately gets alerted.

- If you Deploy the AEGIS backend on a Server, it has a Public IP Address that anyone can reach. However, the target client PC running the Electron App is sitting behind a firewall, on a private IP Address (e.g., `192.168.1.50`).
- If The Server tries to initiate a TCP Connection to that Target PC, the corporate firewall will look at the incoming packet, see that the PC did not ask for it, and instantly drop it. 

- The Only way to establish a connection is from the inside out. When the Electron app INITIATES the connection, the firewall records this in its State Table: **"Internal IP 192.168.1.50 just reached out to IP 3.3.3.3 on Port 443.**

### The Upgrade Request:
- Even if the Electron App initiates the connection, firewalls use Deep Packet Inspection (DPI). If the firewall sees an unrecognized binary protocol trying to leave the network on a random port, it will kill the connection. Firewalls usually only allow traffic on Port 80 (HTTP) and Port 443 (HTTPS).

- **This is why WebSockets do not have their own unique protocol port. WebSockets Use HTTP as a Trojan Horse.**

- Here's the Sequence of How The Electron App and the AEGIS Server will bypass the firewall:
 - 1. The Electron App initiates a Standard HTTP `GET` request from the Client Side on behalf of the User to the AEGIS Server on Port 443. This Request is just a singular packet with many headers.
 - 2. The Firewall inspects the packet, sees a standard Outgoing, OUTBOUND HTTPS web request, and lets it through.
 - 3. Inside the HTTP request Packet, the Electron app includes specific headers: `Connection: Upgrade` and `Upgrade: websocket`. This is the client whispering to the server: "Once we get past the firewall, we upgrade this HTTPS connection to a WebSocket."
 - 4. AEGIS Receives the HTTP request. Before agreeing to the Upgrade, it looks for the `Authorization` header containing the JWT Token.
  - If the JWT is invalid or missing, AEGIS Responds with a standard HTTP `401 Unauthorized` and cuts the TCP Connection. The Tunnel is not even initialized to save resources.
 - 5. If the JWT is valid, the AEGIS Server responds with an HTTP status code `101 Switching Protocols`.
 - 6. As soon as the Electron App Receives the `101` response, both sides immediately abandon the HTTP protocol, the underlying TCP Socket is kept alive, and it transforms into a raw, persistent, bi-directional WebSocket tunnel, The firewall, looking only at the TCP state table, just sees an ongoing flow of data on an allowed port and leaves it alone.

- **This Entire Process, From the inside-out initiation to the HTTP disguise, is why the Electron App MUST be the one to knock on the AEGIS Server's door, rather than the opposite.**

## The `ws` library: 
- Fortunately, this entire library is native to NodeJS, so it'll be pretty easy to use. Again, Fortunately Electron runs NodeJS in the background, so the Electron App will also use the exact same `ws` library. We don't need to manually write the HTTP packet; The library constructs it for us. We just padd it the JWT.

### What Is The `JWT` Token?
- A JWT (JSON Web Token) is a string containing three base64-encoded parts: 
 - A Header
 - A Payload (containing user data like `ID: 5`)
 - A Signature

- Normally, web servers use "Sessions". The Server saves a session ID in its RAM, and the client sends a Cookie to prove who they are. AEGIS Cannot use sessions. It's a waste of memory.
- A **JWT Is Stateless**. The server does not remember the JWT. This is very efficient for the AEGIS Server RAM.

- As we've previously discussed, a WebSocket connection starts as a standard HTTP request. In our scenario, the Client ASKS the server to upgrade this TCP HTTP connection into a WebSocket. This "ask" is called the "Handshake". In our case, we don't allow this Handshake to be completed unless this JWT Token is validated for the safety of the server.
 - Safety From What? If we leave the WebSocket connection open on the Internet for anyone to use, automated botnets (which are malicious devices that scan the internet for unpatched connections to infect their devices and grow the malicious network), will find this connection within minutes. They will spam Handshake requestts to open thousands of Tunnels (DDoS).

#### How We Use The JWT To Stop This:
- First of all, **Note That The User Will First Have To Login To The AEGIS App With Their Credentials Before Initiating Any Evidence Gathering Process. Also, Note That Every User Account Will Obviously Have A Unique Username and ID.**

##### Part 1: The User Logs In (Creation of JWT):
- 1. When The User Types in their username and password in to The Electron App, Electron sends a standard `POST /api/login` HTTP Request containing those credentials in the JSON Body. The AEGIS Server receives the POST request, checks the database, and confirms the password is correct (Hashes this input password and compares it against the already hashed password stored in the database alongside that username).
- 2. The Server Grabs the User's ID from the database. This ID is put into a JSON Object usually called the `payload`. For example: `{"id", 5}`.
- 3. There is a Fixed JSON Object that we define for the AEGIS Server called the `header`. For JWT Tokens, it's a hardcoded object that has two fields: 
 - `alg`: Holds The Name Of The Algorithm Used For Signing the Token. (e.g., `"HS256"` for the HMAC-256 Hashing, which is the standard).
 - `typ`: Tells that this is a JSON Web Token Specifically:

```JSON
{
    "alg": "HS256",
    "typ": "JWT"
}
```

- 4. The Server Takes Both this `header` JSON object and the ID `Payload` Object of the user and performs Base64 Encoding on them to get rid of any non-safe characters (e.g., `{}`, `""`, or `/`) to get `EncodedHeader` and `EncodedPayload`. This turns them into random strings of length 64 each.
- 5. The AEGIS Server then joins these two Encoded Strings with a dot (.) in between them: `EncodedHeader.EncodedPayload` and hashes that combined string with the specified hashing algorithm (`alg`). This creates the `Signature`. 
- 6. The Server Combines All Three Of These Into A Singular String With Dots Between The Strings: **EncodedHeader.EncodedPayload.Signature**. **This Is The JWT**.
- 7. The Server responds to the HTTP `POST` request with a `200 OK` status and sends the newly-crafted JWT back in the JSON Body:

```JSON
{
    "status": "success",
    "token": JWTToken
}
```
- 8. The Electron App Receives This Response Packet, Extracts the `token` string, and saves it in its local memory. **As Long this current Login Session is Live, This String is Valid and Alive.**

##### Part 2: The User Clicks "Gather Evidence" (Verification of JWT):
- 1. When The User clicks "Gather Evidence" On The AEGIS Web Extension, Electron takes that Token out of its local memory and embeds it in the `Authorization: Bearer <Token>` header and initiates the HTTP `GET` Upgrade Request. 

``` HTTP
GET / HTTP/1.1
Host: aegis.server.com
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

- (Notice that this looks like a normal web browser requesting a webpage `GET /`. The firewall sees this, reads the `Host`, and blindly lets it pass. The Trojan Horse here is the `Upgrade` header and the custom `Authorization` header hiding inside.)

- 2. The Server Receives This Packet, and Before Establishing Any Tunnel, it extracts the JWT Token from the `Authorization` header of the request object.
- 3. It splits the token at the dots into three separate strings: `EncodedHeader`, `EncodedPayload`, `Signature`.
- 4. It takes the `EncodedHeader` and `EncodedPayload` strings exactly as they are and joins them with a dot: `EncodedHeader.EncodedPayload`. It then hashes that combined string using the same hashing algorithm to get the `Computed_Signature`.
- 5. It compares the freshly `Computed_Signature` and the given `Signature` string provided in the Token. 
 - If the two match, then AEGIS knows with absolute certainty that it is the one that created the JWT Token and that this user with this specific ID is the one that initiated the Evidence Gathering Process. It knows that this Upgrade request came from a user that is currently logged in to the AEGIS App. The Tunnel is immediately Opened.
 - If the two don't match, or the `Authorization` field is just missing and there is no Token, then the handshake is immediately rejected by the AEGIS Server and no Tunnel is established. 
  - So, no random device that's not currently logged in to the AEGIS App can have a Tunnel established for it. Additionally, nobody that intercepts this network packet to try to log in to someone else's account can bypass this check. Also, if supposedly the account with with the payload: `{"id": 1}` was an Admin Account, they cannot intercept their own packet and change its id to "1" because that would cause a mismatch in hash. 






