## Real Asynchronous Tasks:
- Network I/O Operations like fetching data from an API, a WebSocket Connection, or an incoming HTTP Request are all true asynchronous tasks.
- For such tasks, your CPU does absolutely zero work while waiting. NodeJS hands the network socket over to the operating system kernel through `libuv`. The kernel handles sit entirely in the hardware layer. This means that the main JS thread going through the Event Loop is entirely unbothered by such tasks as the OS literally does everything in the back.
- This is done so far in the back that no type of threads whatsoever are involved, not even the `libuv` internal C++ Thread Pool is involved. 
- With these Tasks, they can occur at any point in time during the Event Loop, but their corresponding callback functions strictly only occur at the Poll Phase.
- When the Event Loop naturally cycles around and reaches the Poll Phase, the OS actually notifies `libuv` of all of those events that finished up and the OS hands over the completed events, then NodeJS executes their callbacks right then and there.

 - For example, if you have a listener for incoming `data` for AEGIS such as this line: 
     ![alt text](../999_Images_Folder/AEGISCallbackTunnel.png)
 - Then, all the Evidence Packets hitting the Server's NIC can come at any time, with no CPU or thread work whatsoever, but their callbacks `containerStream.write(packet_1)`, `containerStream.write(packet_2)`,..., `containerStream.write(packet_n)` are all queued into the Poll Queue and will be executed Synchronously during the Poll Phase. 

## "Fake" Asynchronous Tasks:
- There are other tasks that seem asynchronous, but aren't truly asynchronous. At the same time, they aren't fully CPU-Bound operations. So, they can be performed by the `libuv thread pool`.