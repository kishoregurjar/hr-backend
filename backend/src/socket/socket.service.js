"use strict";

const { Server } = require("socket.io");
const logger = require("../config/logger");
const socketMiddleware = require("./socket.middleware");

class SocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize the Socket.IO server
   * @param {import("http").Server} httpServer
   */
  init(httpServer) {
    if (this.io) {
      logger.warn("Socket.IO already initialized");
      return;
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: true,
        credentials: true,
      },
      pingTimeout: 60000,
    });

    // Apply authentication middleware
    this.io.use(socketMiddleware);

    this.io.on("connection", (socket) => {
      const { user, companyId } = socket.data;
      
      logger.info(`Socket connected: ${socket.id} (User: ${user.sub}, Company: ${companyId || 'None'})`);

      socket.on("disconnect", (reason) => {
        logger.info(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
      });
    });

    logger.info("Socket.IO initialized successfully");
  }

  /**
   * Emit an event to a specific room
   * @param {string} room - The room name (e.g. 'company:123')
   * @param {string} event - The event name
   * @param {object} payload - The event data
   */
  emitToRoom(room, event, payload) {
    if (!this.io) {
      logger.error("Socket.IO not initialized. Cannot emit event.");
      return;
    }
    
    try {
      this.io.to(room).emit(event, payload);
    } catch (error) {
      logger.error(`Error emitting socket event ${event} to room ${room}:`, error);
    }
  }

  /**
   * Emit an event to a specific company room
   * @param {string} companyId - The company ID
   * @param {string} event - The event name
   * @param {object} payload - The event data
   */
  emitToCompany(companyId, event, payload) {
    if (!companyId) return;
    this.emitToRoom(`company:${companyId}`, event, payload);
  }

  /**
   * Broadcast an event to all HR users globally
   * @param {string} event - The event name
   * @param {object} payload - The event data
   */
  emitGlobalHR(event, payload) {
    this.emitToRoom("global:hr", event, payload);
  }
}

// Export as a singleton
const socketService = new SocketService();
module.exports = socketService;
