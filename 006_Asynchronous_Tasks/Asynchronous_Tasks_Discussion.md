## Real Asynchronous Tasks:
- Network I/O Operations like fetching data from an API, a WebSocket Connection, or an incoming HTTP Request are all true asynchronous tasks.
- For such tasks, your CPU does absolutely zero work while waiting. NodeJS hands the network socket over to the operating system kernel through `libuv`. The kernel handles sit entirely in the hardware layer. This means that the main JS thread going through the Event Loop is entirely unbothered by such tasks as the OS literally does everything in the back.
- This is done so far in the back that no type of threads whatsoever are involved, not even the `libuv` internal C++ Thread Pool is involved. 
- With these Tasks, they can occur at any point in time during the Event Loop, but their corresponding callback functions strictly only occur at the Poll Phase.
- When the Event Loop naturally cycles around and reaches the Poll Phase, the OS has already notified `libuv` of all of those events that finished up and the OS handed over the completed events and their corresponding callbacks, then NodeJS executes their callbacks right then and there.

 - For example, if you have a listener for incoming `data` for AEGIS such as this line: 
     ![alt text](../999_Images_Folder/AEGISCallbackTunnel.png)
 - Then, all the Evidence Packets hitting the Server's NIC can come at any time, with no CPU or thread work whatsoever, but their callbacks `containerStream.write(packet_1)`, `containerStream.write(packet_2)`,..., `containerStream.write(packet_n)` are all queued into the Poll Queue and will be executed Synchronously during the Poll Phase. 



## "Fake" Asynchronous Tasks:
- There are other tasks that seem asynchronous, but aren't truly asynchronous. At the same time, they aren't in the level of Synchronous custom JS code; They're a bit more tame than that. Still though, they are actually, in reality, synchronous blocking operations under the hood.
- Operating Systems like Linux and Windows provide native thread-less asynchronous interfaces for things like Network Sockets (TCP/UDP). However, operating systems do NOT provide a reliable, cross-platform asynchronous interface for reading physical files from a Hard Drive or SSD. In reality, asking a hard drive to read a file is inherently a blocking operation. The CPU must wait for the disk's memory to fetch the bytes.
- Since reading a file is a blocking operation, if V8 did it directly, the Main Thread would freeze. However, there's a sort of hack around this. To "fake" the asynchronous behavior, NodeJS takes that blocking file-read command and hands it to one of the background `libuv` threads from the `libuv` thread pool.
- Since these tasks aren't custom JS logic and are still defined in very low-level C++ by NodeJS natively, they can be offloaded to `libuv` threads.
- That specific background thread now becomes completely blocked while it waits for the SSD to return the file being read. However, because it is running on a background thread on a different CPU (Hopefully, if it's the same CPU, then we experience the "hot potato" chicanery, which is still better than nothing I suppose, but not full parallelism), the Main V8 Thread is free to keep spinning through the Event Loop. This gives the illusion of the operation being purely asynchronous because it was just executed without blocking the main thread whatsoever while having no `worker` thread spawned by us manually, but background threads running on different cores are being ran in the background automatically by NodeJS.
 - NodeJS is simultaneously helping us not waste our cores and utilizes them automatically while also saving us from the trouble of writing our own `worker_thread` multi-threading code with and also saving a lot of resources in the process.

- Examples of these "Fake Asynchronous Tasks" include File-System Operations (which we'll explore in more detail) like `fs.readFile`, DNS Lookups `dns.lookup`, and heavy Cryptography `crypto.pbkdf2`, and this also includes hashing as we've seen previously.
 - These are just examples, but in reality, this works for pretty much any NodeJ-native module and its functions as long as our Custom JS code is not involved.

- Obviously, this still does need multiple cores for it to be fully parallel. If you have 8 cores, one for the Main Thread, and 7 others that are reading files, and there's an 8th file that you'd like to read in that same time, there will be some Non-parallel Concurrency happening.
 - For example, in the case of these `libuv` threads, `libuv` by default spawns 4 of them. Even if you have 8 cores, if you leave the default amount of threads as is, then you'll only be able to read 4 files at the exact same time. If you try to read a fifth, the first 4 will block all 4 threads and the 5th file will sit in a queue waiting for one of the threads to finish and free up.
 - This is unlike Network I/0 which can handle 10,000 concurrent sockets without a single thread.

- When the background `libuv` thread finally finishes its blocking task, it signals the Main Thread. The corresponding callback (e.g., the function that processes the read file) is dropped directly into the Poll Phase Queue to be executed SYNCHRONOUSLY by V8 as all callbacks are executed synchronously.



## Fully Synchronous Tasks (CPU-Bound Custom JS):
- These are tasks that execute directly on the V8 Engine's Main Thread. They are completely blind to `libuv`, the OS kernel, and the background threads of `libuv`.
- For example, Custom loops, massive array iterations, complex Regex parsin, custom Math or Hashing functions, etc.
- The thing about these is that if you write a massive `for` loop inside a callback and the time to execute that callback comes, the Event Loop stops entirely. The loop will not advance to the Timers Phase, the Check Phase, or process incoming Network Packets in the Poll Phase until the `for` loop finishes. 
- Even with the `libuv` thread pool, you cannot offload these tasks. `libuv` threads are written in C++ and only know how to execute predefined NodeJS C++ bindings. They cannot execute custom JS logic.

- If you have custom JS code that is CPU-Bound, the only way to achieve true parallelism and unblock the Event Loop is to use the `worker_threads` module, spinning up an entirely isolated V8 Engine clone on a different CPU Core. 


- You see, when network packets hits the physical NIC, the OS places them in a kernel memory buffer. It does not push them to NodeJS. When the Event Loop reaches the Poll Phase, it executes a low-level system call; This command asks the OS: "Give me the file descriptors that have data waiting". `libuv` then physically pulls that data cross the boundary from kernel memory into V8 RAM, generates the callback, and executes them.
- Understanding that NodeJS has to actively ASK the OS for the data during the Poll Phase explains why a frozen Event Loop (stuck on a heavy `for` loop) causes packets to pile up and drop at the OS level because NodeJS never arrived at the Poll Phase to ask for them. 