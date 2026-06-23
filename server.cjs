const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const users = new Map();
const calls = new Map();

const presenceSnapshot = () =>
  Array.from(users.entries()).reduce((acc, [uid, value]) => {
    acc[uid] = value.sockets.size > 0;
    return acc;
  }, {});

const registerSocket = (socket, user) => {
  if (!user?.uid) return;
  const existing = users.get(user.uid) || {
    uid: user.uid,
    name: user.name || user.email || "User",
    email: user.email || "",
    sockets: new Set(),
  };

  existing.name = user.name || existing.name;
  existing.email = user.email || existing.email;
  existing.sockets.add(socket.id);
  users.set(user.uid, existing);
  socket.data.uid = user.uid;
  socket.join(user.uid);
  socket.emit("presence-snapshot", presenceSnapshot());
  socket.broadcast.emit("presence-update", { uid: user.uid, online: true });
};

const emitToUsers = (uids, event, payload) => {
  [...new Set(uids.filter(Boolean))].forEach((uid) => io.to(uid).emit(event, payload));
};

io.on("connection", (socket) => {
  socket.on("register-user", (user) => registerSocket(socket, user));
  socket.on("register", (uid) => registerSocket(socket, { uid }));

  socket.on("call-user", (payload) => {
    const targetUids = payload.targetUids || payload.participantUids?.filter((uid) => uid !== payload.callerUid) || [];
    calls.set(payload.callId, {
      callId: payload.callId,
      threadId: payload.threadId,
      callerUid: payload.callerUid,
      participantUids: payload.participantUids || [payload.callerUid, ...targetUids],
      accepted: new Set([payload.callerUid]),
      mode: payload.mode || "video",
    });

    emitToUsers(targetUids, "incoming-call", {
      callId: payload.callId,
      threadId: payload.threadId,
      callerUid: payload.callerUid,
      callerName: payload.callerName,
      callerEmail: payload.callerEmail,
      participantUids: payload.participantUids || [payload.callerUid, ...targetUids],
      mode: payload.mode || "video",
    });
  });

  socket.on("answer-call", (payload) => {
    const call = calls.get(payload.callId);
    if (call) call.accepted.add(payload.acceptedBy);

    io.to(payload.callerUid).emit("call-accepted", payload);
    emitToUsers(
      (payload.participantUids || []).filter((uid) => uid !== payload.acceptedBy),
      "participant-joined",
      {
        callId: payload.callId,
        uid: payload.acceptedBy,
        name: payload.acceptedByName,
        mode: payload.mode || call?.mode || "video",
      }
    );
  });

  socket.on("reject-call", (payload) => {
    io.to(payload.callerUid).emit("call-rejected", payload);
  });

  socket.on("call-missed", (payload) => {
    io.to(payload.callerUid).emit("call-missed", payload);
    calls.delete(payload.callId);
  });

  socket.on("cancel-call", (payload) => {
    emitToUsers(payload.targetUids || [], "call-ended", payload);
    calls.delete(payload.callId);
  });

  socket.on("call-ended", (payload) => {
    const call = calls.get(payload.callId);
    const recipients = call?.participantUids || [];
    emitToUsers(
      recipients.filter((uid) => uid !== payload.fromUid),
      "call-ended",
      payload
    );
    calls.delete(payload.callId);
  });

  socket.on("participant-left", (payload) => {
    const call = calls.get(payload.callId);
    emitToUsers(call?.participantUids || [], "participant-left", payload);
  });

  socket.on("webrtc-offer", (payload) => io.to(payload.targetUid).emit("webrtc-offer", payload));
  socket.on("webrtc-answer", (payload) => io.to(payload.targetUid).emit("webrtc-answer", payload));
  socket.on("webrtc-ice-candidate", (payload) => io.to(payload.targetUid).emit("webrtc-ice-candidate", payload));
  socket.on("media-status", (payload) => {
    const call = calls.get(payload.callId);
    emitToUsers(
      (call?.participantUids || []).filter((uid) => uid !== payload.fromUid),
      "media-status",
      payload
    );
  });

  socket.on("disconnect", () => {
    const uid = socket.data.uid;
    if (!uid) return;
    const user = users.get(uid);
    if (!user) return;
    user.sockets.delete(socket.id);
    if (user.sockets.size === 0) {
      users.set(uid, user);
      socket.broadcast.emit("presence-update", { uid, online: false });
    }
  });
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Communication server running on ${PORT}`);
});
