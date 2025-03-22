const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const processRoutes = require('./routes/processRoutes');  // ✅ Import routes

// Environment variables with defaults for development
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_PATH = NODE_ENV === 'production' 
    ? path.join(__dirname, '../dist/client') 
    : path.join(__dirname, '../client');

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

io.on('connection', (socket) => {
    userCount++;
    console.log('🟢 User connected:', socket.id);
    
    // Broadcast updated user count to all clients
    io.emit('userCount', userCount);

    socket.on('draw', (data) => {
        socket.broadcast.emit('draw', data); // Broadcast drawing to others
    });

    socket.on('clear', (data) => {
        // Forward the clear event with initiator info
        io.emit('clear', data); // Clear canvas for all users
    });

    socket.on('disconnect', () => {
        userCount = Math.max(0, userCount - 1); // Prevent negative counts
        console.log('🔴 User disconnected:', socket.id);
        
        // Broadcast updated user count
        io.emit('userCount', userCount);
    });
});

// API Routes
app.use('/', processRoutes);  // ✅ Use the routes module

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
