const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const processRoutes = require('./routes/processRoutes');  // ✅ Import routes
const authRoutes = require('./routes/auth');  // ✅ Import auth routes

// Environment variables with defaults for development
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartwhiteboard';
const CLIENT_PATH = NODE_ENV === 'production' 
    ? path.join(__dirname, '../dist/client') 
    : path.join(__dirname, '../client');

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('📊 MongoDB Connected'))
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.static(CLIENT_PATH));  // Serve frontend
app.use(express.json({ limit: '10mb' }));  // JSON body parsing with increased limit

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../client/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Socket.io Events
let userCount = 0;
const userRooms = new Map(); // Map to track which room each user is in

io.on('connection', (socket) => {
    userCount++;
    console.log('🟢 User connected:', socket.id);
    
    // Get user information from auth token (if available)
    let userId = socket.handshake.auth.userId || socket.id;
    
    // Initially, place user in their own private room (same as their ID)
    let roomId = userId;
    socket.join(roomId);
    userRooms.set(socket.id, roomId);
    
    console.log(`User ${socket.id} joined room ${roomId}`);
    
    // Broadcast updated user count to all clients
    io.emit('userCount', userCount);
    
    // Handle room joining (for shared whiteboard sessions)
    socket.on('joinRoom', (newRoomId) => {
        // Leave current room
        const currentRoom = userRooms.get(socket.id);
        if (currentRoom) {
            socket.leave(currentRoom);
            console.log(`User ${socket.id} left room ${currentRoom}`);
        }
        
        // Join new room
        socket.join(newRoomId);
        userRooms.set(socket.id, newRoomId);
        console.log(`User ${socket.id} joined room ${newRoomId}`);
        
        // Notify the client they successfully joined
        socket.emit('roomJoined', { roomId: newRoomId });
    });

    socket.on('draw', (data) => {
        // Include the sender's ID with the data
        const enhancedData = {
            ...data,
            sender: socket.id
        };
        
        // Only broadcast to users in the same room
        const roomId = userRooms.get(socket.id);
        if (roomId) {
            socket.to(roomId).emit('draw', enhancedData);
        }
    });

    socket.on('clear', (data) => {
        // Include the initiator's ID with the data
        const enhancedData = {
            ...data,
            initiator: socket.id
        };
        
        // Only broadcast to users in the same room
        const roomId = userRooms.get(socket.id);
        if (roomId) {
            socket.to(roomId).emit('clear', enhancedData);
        }
    });

    socket.on('disconnect', () => {
        userCount = Math.max(0, userCount - 1); // Prevent negative counts
        console.log('🔴 User disconnected:', socket.id);
        
        // Remove from room tracking
        userRooms.delete(socket.id);
        
        // Broadcast updated user count
        io.emit('userCount', userCount);
    });
});

// API Routes
app.use('/', processRoutes);  // ✅ Use the routes module
app.use('/api/auth', authRoutes);  // ✅ Use the auth routes

// Catch-all route to return the HTML file for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_PATH, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running in ${NODE_ENV} mode at http://localhost:${PORT}`);
});
