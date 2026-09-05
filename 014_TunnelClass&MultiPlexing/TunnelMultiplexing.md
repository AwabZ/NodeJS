## Multiplexing:
- (Note: In this document, `wsServer` refers to the Client-Side Special WebSocket Object That The Electron App Uses To Send Data To The Server After The WebSocket Handshake is Done. Meanwhile, `wsClient` still refers to the WebSocket object that the Server uses to talk to the Client).

- First of all, it's important to understand that the only function that WebSocket `ws` provides for sending Packets down a WebSocket connection is the `wsServer.send(rawBytes)` method. It sends these Bytes to the other end of the `wsServer` Socket and calls it a day. It doesn't do anything extra.

- Imagine you have exactly one physical pipe connecting your house (Electron) to the water treatment plant (AEGIS Server) and you need to send three different things down this exact same pipe at the exact same time:
 - 1. Clean Water (Control Commands).
 - 2. Oil (Encypted Traffic).
 - 3. Sand (Raw Binary Evidence Like The Screenshots).

- If you just shove them all down the pipe at the exact same time using `wsServer.send()`, they mix together. If the Electron App sends a 10MB Chunk of Bytes, the AEGIS Server receives it in `wsClient.on("message", (data))`, which in our case would be in the `userTunnel.on("evidence", (evidencePacket))`. 
 - The problem is, what is this data? Is it part of the DOM? Is it A Screenshot? Is it an Error Log From The Electron App? The `wsClient` WebSocket does not know. It just sees Zeros and Ones. So, how will it know what object each packet belongs to and how to order them? 
- When AEGIS Receives the sludge on the other end, it doesn't know what to do. Should it put that Sludge in SHA-256 Hashing on the assumption that it's evidence or should it execute it as a command? 

- **Multiplexing is the act of putting the Water, Oil, and Sand into little capsules, putting a color-coded sticker on each capsule, then throwing them down the pipe.**
- **Demultiplexing is standing at the other end of the pipe, looking at the sticker on each capsule, and throwing the water into the water tank, the oil into the oil tank, and sand into the sand tank, because the Stickers gave you an indicator of the type of capsule.**

- **To Put Things More Bluntly, We'll Have To Mark Every Single Packet Sent By The AEGIS App To The AEGIS Server So We Can Distinguish Between Them. We Have To Play With Binaries To Do This Because `ws` is Too Bare-Metal unlike `Socket.io`**.

### How Socket.io Does This Automatically:
- When you use Socket.io, you can write:
 - `socket.emit("screenshot", imageFile)`
 - `socket.emit("chat_message", "Hello")`

- Socket.io is a Multiplexer. Behind the Scenes, it takes your `imageFile`, converts it into a giant text string, wraps it in a JSON object like `{"event": "screenshot", "data": "........"}`, and sends that JSON string down the TCP pipe.

- Why can't we just use `JSON.strigify()` on our raw WebSockets to Solve This Problem like `Socket.io`? Because JSON is strictly Text-Based.
 - AEGIS is handling forensic **Binary Evidence (Compiled Code, Image Files, Encrypted Bytes). If you try to shove a raw image file into a JSON string, the text parser corrupts the binary data.**
 - Technically, we can first encode the image into Base64 text to make it fit in JSON, but Base64 expands the file size by 33%. If Electron sends 100MB worth of data, Base64 turns it into 133MB, which wastes CPU, RAM, and alters the original hash of the evidence. Remember, we don't want to touch the original data.


## The NodeJS `Buffer` Class:
- A `Buffer` in NodeJS is simply a Javascript Array, but instead of holding strings or objects, every single slot in the array holds exactly one Byte, not Bit, but Byte (A Number Between 0 and 255).
- If you have a 5-byte Buffer, it looks like this in memory: `[ 0, 0, 0, 0, 0 ]`.

- To Multiplex raw Binary Data without corrupting it, We Create A Very Simple Rule For Both The Electron App and The AEGIS Server: **The Very First Slot (Index 0) Of Every Buffer Array We Send Will Always Be Our "Sticker". It Will Be The Indicator To What This Packet Is.**
 - If Index `0` is `1`, the rest of the array is a Control Command.
 - If Index `0` is `2`, the rest of the array is Encrypted Traffic.
 - If Index `0` is `3`, the rest of the array is Binary Evidence.

### The Multiplexer (Electron App):
- Instead of just sending the raw evidence, **Electron Creates a new `Buffer` array that is 1 byte larger than the Evidence. It writes the number `3` into the first slot. It copies the raw evidence into the remaining slots. Then it calls `wsServer.send(Buffer)`.**

### The Demultiplexer (AEGIS Server):
- When The Server's `Tunnel.on("evidence", (evidencePacket))` fires, `evidencePacket` is a `Buffer` Object.
- The Server simply looks at `evidencePacket[0]`. 
 - "The first byte is a "3"! That means everything from index `1` to the end of the array is Evidence. I will route it to the SHA-256 Hashing".

- This achieves exact routing of different data types over a single connection, using zero text parsing, zero JSON Overhead, and zero corruption of the underlying evidence. 

### Why Not Add Extra Headers?
- Instead of adding this extra byte at the head of each packet before shooting it down the WebSocket, why not just add that extra peice of information as a header to the packet? 
- Recall that the second `101 Switching Protocols` handshake is complete, HTTP ceases to exist. There are no more headers.
- In standard HTTP, if you want to send different types of data, you just add a header: `Content-Type: image/jpeg` or `Content-Type: application/json`.
- In a WebSocket, you just have a raw Tunnel. When the Electron App calls `wsServer.send(data)`, it just dumps raw zeros and ones down the wire. When the AEGIS Server Receives it via `wss.on("message", (evidencePacket))`, the server looks at the data and has absolutely no idea what it is. There are no URLs and no Headers. It is just a massive pile of Bytes. 

### Does This Method Certainly Not Corrupt The Data?
- 100% certainly. Because we'll use the `subarray(1)` method to slice off the first byte on the server side, the remaining bytes are bit-for-bit identical to the original payload. There is zero compression, zero encoding, and zero data loss. The SHA-256 Hash of the extracted Payload will perfectly match the Hash of the payload before it left the Electron App.


## Not To Be Confused With Multiplexing For Multiple Users:
- Multiplexing usually refers to the transfer of the data of multiple users through the same transmission medium efficiently without mixing their data together. That's where the Time-Division Multiplexing and Frequency-Division Multiplexing talk occurs. This is entirely different from the Type Of Multiplexing we're discussing.
- We have no fear of mixing the data of different users here. **At The Operating System Level, Every Single User Has Their Own Socket With Its Own Unique "File Descriptor" Index Of The Sockets Array. User A's `wsClient` and User B's `wsClient` are physically separate objects in V8's memory. NodeJS and the OS handle the routing of incoming TCP packets to the correct Socket based on the User's IP address and Port Combination.**
- **Every Single User Has Their Own Distinct WebSocket Tunnel.**


## Extending The Tunnel Class Even Further:
- For The Sender, (The Electron App), They'll have to mark every single packet with a category before they send it. 
- Assuming They Want To Send Evidence, (First Byte is `3`), we'll take in their `binaryDataBuffer` into our `sendEvidence()` function, create a new `Buffer` object of length (`binaryDataBuffer.length + 1`), which is 1 byte for the "sticker" and the remaining is for the Evidence itself: 

```JS
const packet = Buffer.alloc(binaryDataBuffer.length + 1);
```

- We Take That packet and we write the number `3` for evidence into the very first slot at index `0` using:

```JS
packet.writeUInt8(3,0);
```

- Then, we need to copy all the actual evidence bytes of `binaryDataBuffer` into the remaining slots of `packet`, starting from index `1`:

```JS
binaryDataBuffer.copy(packet, 1);
```

- Then, we simply send the packet over the WebSocket Tunnel with the same `wsServer.send(packet)` function:

```JS
wsClient.send(packet);
```

- So, for the Client Electron App, we would define this function:

```JS
function sendEvidence(binaryDataBuffer){
    // 1. Allocate a new block of memory (1 byte for the sticker + the evidence size)
    const packet = Buffer.alloc(1 + binaryDataBuffer.length);
    
    // 2. Write our "Sticker" (the number 3 for Evidence) into the very first slot (index 0)
    packet.writeUInt8(3, 0); 
    
    // 3. Copy all the evidence bytes into the new packet, starting at index 1
    binaryDataBuffer.copy(packet, 1);
    
    // 4. Send the multiplexed packet down the WebSocket
    wsServer.send(packet); // We don't need to pass wssServer as a paramter to this function because there's only one of it anyway, and it's global. This is the Socket To The Server itself From The Client-Side Prespective.
}
```


- As For The Receiver AEGIS Server Side, we Alter The `Tunnel` Class so that whenever it hears a raw `message`, it doesn't just emit an abstract, ambiguous `evidence` event, it will output an entirely different event depending on the type of packet, because the server's reaction to each type of packet is different:

```JS
_initializeTunnel() {
    this.wsClient.on("pong", () => {
        this.isAlive = true;
    });

    // The Demultiplexer
    this.wsClient.on("message", (rawBuffer) => {
        // Read the very first byte (Unsigned 8-bit Integer)
        const packetType = rawBuffer.readUInt8(0);
        
        // Extract everything after the first byte
        const payload = rawBuffer.subarray(1);

        // Route the packet to the correct system based on the Header
        switch (packetType) {
            case 1:
                this.emit("control_command", payload);
                break;
            case 2:
                this.emit("proxy_traffic", payload);
                break;
            case 3:
                this.emit("evidence", payload);
                break;
            case 4:
                this.emit("client_error", payload);
                break;
            default:
                console.error("Unknown packet type received:", packetType);
        }
    });

    this.wsClient.on("close", () => { /* ... */ });
    this.wsClient.on("error", () => { /* ... */ });
}
```

- Obviously, you'd implement the Other Client-Side Functions that Do This Same Process just like the `sendEvidence` one. 