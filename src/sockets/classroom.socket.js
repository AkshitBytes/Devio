export function registerClassroomSocket(io) {
  io.on("connection", (socket) => {
    socket.on("classroom:join", ({ classroomId }) => {
      if (!classroomId) return;
      socket.join(`classroom:${classroomId}`);
    });

    socket.on("classroom:message", ({ classroomId, message, user }) => {
      if (!classroomId || !message) return;
      const payload = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        message: String(message).slice(0, 4000),
        user: user || { name: "Anonymous" },
        ts: Date.now(),
      };
      io.to(`classroom:${classroomId}`).emit("classroom:message", payload);
    });
  });
}

