# Collaborative Whiteboard Project 
This project includes a real-time collaborative whiteboard with AI symbol prediction. 

## Features
- Real-time collaborative drawing with Socket.IO
- Mathematical symbol recognition using AI
- Undo/Redo functionality
- Eraser tool
- Color and brush size selection
- Download drawing as PNG
- Expression evaluation for basic mathematical expressions

## Project Structure
```
project/
├── client/               # Frontend code
│   ├── CSS/             # Styling
│   ├── JS/              # JavaScript files
│   └── uploads/         # Uploaded images (created automatically)
├── server/               # Node.js server
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── utils/           # Helper functions
├── python/               # AI prediction code
│   ├── model/           # Model loader
│   ├── ModelFile/       # Trained model
│   └── utils/           # Python utilities
└── myenv/                # Python virtual environment
```

## Prerequisites
- Node.js (v14+)
- Python (v3.8+)
- TensorFlow (v2.12+)

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/collaborative-whiteboard.git
cd collaborative-whiteboard
```

### 2. Set up Node.js server
```bash
cd server
npm install
```

### 3. Set up Python environment
```bash
# Create virtual environment
python -m venv myenv

# Activate environment
# On Windows:
myenv\Scripts\activate
# On macOS/Linux:
source myenv/bin/activate

# Install dependencies
cd python
pip install -r requirements.txt
```

## Running the Application

### Start the server
```bash
cd server
npm start
```

The application will be available at http://localhost:5000

## Deployment

### Environment Variables
The application supports the following environment variables:
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment ('development' or 'production')
- `PYTHON_PATH`: Custom path to Python interpreter

### Deploying to a VPS/Cloud
1. Build the client (if using a build step)
2. Set environment variables 
3. Ensure the Python virtual environment is set up
4. Start the server with PM2 or similar process manager

```bash
# Example with PM2
npm install -g pm2
pm2 start server/server.js --name="whiteboard"
```

## License
MIT
