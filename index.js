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

// The Front Door: Listens for any user who successfully upgrades to a WebSocket connection.
io.on("connection", (socket) => {
  // 'socket' represents the individual Walkie-Talkie for the specific user who just connected.
  console.log(`User connected with personal socket ID: ${socket.id}`);

  // -----------------------------------------------------------------------
  // STEP 1: JOINING A ROOM BUCKET
  // -----------------------------------------------------------------------
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    console.log(`User ${userId} was placed into room bucket ${roomId}`);
    socket.to(roomId).emit("user-connected", userId);
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
