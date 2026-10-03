const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

// 1. Initialize Express (The Routing Framework)
const app = express();

// 2. Middleware to allow cross-origin requests and parse JSON
app.use(cors());
app.use(express.json());

// 3. Create the raw HTTP server and wrap Express inside it.
// We must do this manually because Socket.io requires the raw HTTP engine to intercept the "Upgrade" request.
const server = http.createServer(app);

// 4. Initialize Socket.io (The Bouncer and The Matchmaker)
// We set origin to '*' so our React app on Port 3000 is allowed to connect without security errors.
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// A simple API route to check if the HTTP lane is working
app.get("/", (req, res) => {
  res.send("Zoom Clone Signaling Server is running on the standard HTTP lane!");
});

// ========================================================================= //
// === SOCKET.IO MATCHMAKING & SIGNALING LOGIC (THE WEBSOCKET LANE) ======== //
// ========================================================================= //

// A temporary dictionary to hold chat messages in RAM while the server is running
const roomChatHistory = {};
// A temporary dictionary to map Socket IDs to Usernames
const roomUserNames = {};

// The Front Door: Listens for any user who successfully upgrades to a WebSocket connection.
io.on("connection", (socket) => {
  // 'socket' represents the individual Walkie-Talkie for the specific user who just connected.
  console.log(`User connected with personal socket ID: ${socket.id}`);

  // -----------------------------------------------------------------------
  // STEP 1: JOINING A ROOM BUCKET
  // -----------------------------------------------------------------------
  socket.on("join-room", (roomId, userId, userName) => {
    socket.join(roomId);
    console.log(`User ${userName} (${userId}) was placed into room bucket ${roomId}`);
    
    // 0. Save the user's name in the server RAM
    if (!roomUserNames[roomId]) roomUserNames[roomId] = {};
    roomUserNames[roomId][userId] = userName || "Guest";

    // 1. Create a blank chat history for this room if it doesn't exist yet
    if (!roomChatHistory[roomId]) {
      roomChatHistory[roomId] = [];
    }
    
    // 2. Hand the entire chat history DIRECTLY to the person who just joined
    socket.emit("chat-history", roomChatHistory[roomId]);

    // 3. Hand the dictionary of everyone's names to the person who just joined!
    socket.emit("all-usernames", roomUserNames[roomId]);

    // 4. Shout to everyone else that a new person arrived (and tell them the name!)
    socket.to(roomId).emit("user-connected", userId, userName || "Guest");
  });

  // -----------------------------------------------------------------------
  // STEP 1.5: TEXT CHAT
  // -----------------------------------------------------------------------
  socket.on("send-chat", (roomId, text, userName) => {
    const messageObj = {
      senderId: socket.id,
      senderName: userName || "Guest",
      text: text,
    };
    
    // Save to server memory
    if (!roomChatHistory[roomId]) roomChatHistory[roomId] = [];
    roomChatHistory[roomId].push(messageObj);

    // Shout to everyone ELSE in the room
    socket.to(roomId).emit("receive-chat", messageObj);
  });

  // -----------------------------------------------------------------------
  // STEP 2: THE WEBRTC CATCH-22 (THE POSTMAN)
  // -----------------------------------------------------------------------
  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming);
  });

  socket.on("toggle-mute", (roomId, isMuted) => {
    socket.to(roomId).emit("user-toggled-mute", socket.id, isMuted);
  });

  socket.on("toggle-video", (roomId, isVideoOff) => {
    socket.to(roomId).emit("user-toggled-video", socket.id, isVideoOff);
  });

  socket.on("change-name", (roomId, newName) => {
    // Update the server's RAM memory
    if (roomUserNames[roomId]) {
      roomUserNames[roomId][socket.id] = newName;
    }
    // Tell everyone else to update their video box name tags!
    socket.to(roomId).emit("user-name-changed", socket.id, newName);
  });

  socket.on("direct-state", ({ target, isMuted, isVideoOff }) => {
    io.to(target).emit("user-toggled-mute", socket.id, isMuted);
    io.to(target).emit("user-toggled-video", socket.id, isVideoOff);
  });

  // -----------------------------------------------------------------------
  // STEP 3: THE CLEANUP CREW
  // -----------------------------------------------------------------------
  // "disconnecting" fires right before they leave the room, so we still know which room they were in!
  socket.on("disconnecting", () => {
    console.log(`User disconnecting: ${socket.id}`);
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit("user-disconnected", socket.id);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`User fully disconnected: ${socket.id}`);
  });
});

// Start the raw HTTP server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling Server is listening on http://localhost:${PORT}`);
});
