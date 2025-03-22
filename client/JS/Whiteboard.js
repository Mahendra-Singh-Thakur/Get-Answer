// Whiteboard.js - Fully featured collaborative whiteboard

const socket = io();
const canvas = new fabric.Canvas('whiteboard', { 
    isDrawingMode: true,
    width: document.querySelector('.canvas-container').clientWidth,
    height: window.innerHeight * 0.6
});

// Set white background
canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));

// Initial settings
canvas.freeDrawingBrush.color = 'black';
canvas.freeDrawingBrush.width = 5;
canvas.selection = false;
canvas.defaultCursor = 'crosshair';

let history = [], redoStack = [], isErasing = false, eraserSize = 30;
let connectedUsers = 1; // Start with just the current user

// --------- Helpers ---------
function saveHistory() {
    history.push(JSON.stringify(canvas));
    redoStack = [];
}

function undo() {
    if (history.length) {
        redoStack.push(JSON.stringify(canvas));
        canvas.loadFromJSON(history.pop(), canvas.renderAll.bind(canvas));
    }
}

function redo() {
    if (redoStack.length) {
        history.push(JSON.stringify(canvas));
        canvas.loadFromJSON(redoStack.pop(), canvas.renderAll.bind(canvas));
    }
}

function clearBoard() {
    if (confirm('Are you sure you want to clear the whiteboard?')) {
        saveHistory();
        canvas.clear();
        canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));
        
        // Only emit to others, don't trigger a cycle
        socket.emit('clear', { initiator: socket.id });
    }
}

// --------- Eraser ---------
function toggleEraser() {
    isErasing = !isErasing;
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.color = isErasing ? 'white' : colorPicker.value;
    canvas.freeDrawingBrush.width = isErasing ? eraserSize : brushSize.value;
    canvas.defaultCursor = isErasing ? 'none' : 'crosshair';

    if (isErasing) document.addEventListener('mousemove', drawEraserCursor);
    else {
        document.removeEventListener('mousemove', drawEraserCursor);
        removeEraserCursor();
    }
    eraserBtn.innerHTML = isErasing ? '<i class="fas fa-pen"></i> Pen Mode' : '<i class="fas fa-eraser"></i> Eraser';
    eraserBtn.classList.toggle('primary', isErasing);
}

function drawEraserCursor(e) {
    let cursor = document.getElementById('eraserCursor') || document.createElement('div');
    if (!cursor.id) {
        cursor.id = 'eraserCursor';
        document.body.appendChild(cursor);
    }
    Object.assign(cursor.style, {
        width: `${eraserSize}px`, height: `${eraserSize}px`,
        border: '2px solid black', borderRadius: '50%', background: 'rgba(255,255,255,0.8)',
        position: 'absolute', pointerEvents: 'none',
        left: `${e.pageX - eraserSize / 2}px`, top: `${e.pageY - eraserSize / 2}px`,
        zIndex: '100'
    });
}

function removeEraserCursor() {
    const cursor = document.getElementById('eraserCursor');
    if (cursor) cursor.remove();
}

// --------- Get Answer (Save + Predict) ---------
function getAnswer() {
    const bg = new fabric.Rect({
        left: 0,
        top: 0,
        width: canvas.width,
        height: canvas.height,
        fill: 'white',
        selectable: false,
        evented: false
    });
    canvas.add(bg);
    canvas.sendToBack(bg);
    canvas.renderAll();

    const dataURL = canvas.toDataURL('image/png');
    canvas.remove(bg);
    canvas.renderAll();

    // Show loading spinner with animation
    showLoading(); 

    // Send to backend
    fetch('/process', {  // Assuming '/process' endpoint will handle both saving + prediction
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL })
    })
    .then(res => res.json())
    .then(data => {
        // Display in our result display div
        displayResults(data);
    })
    .catch(error => {
        console.error('Error:', error);
        displayResults({ error: 'Failed to process image. Please try again.' });
    })
    .finally(hideLoading); // Hide spinner
}

// Display the prediction results in the UI
function displayResults(data) {
    const resultDisplay = document.getElementById('result-display');
    const predictionContent = document.getElementById('prediction-content');
    
    // Clear previous content
    predictionContent.innerHTML = '';
    
    if (data.error) {
        // Display error message
        predictionContent.innerHTML = `<div class="error"><i class="fas fa-exclamation-triangle"></i> ${data.error}</div>`;
    } else if (data.message) {
        // Display message if no symbols detected
        predictionContent.innerHTML = `<p class="no-symbols"><i class="fas fa-info-circle"></i> ${data.message}</p>`;
    } else {
        // Format and display the prediction results
        const symbols = Object.entries(data)
            .filter(([key]) => key.startsWith('symbol_'))
            .sort((a, b) => {
                const numA = parseInt(a[0].split('_')[1]);
                const numB = parseInt(b[0].split('_')[1]);
                return numA - numB;
            })
            .map(([_, value]) => value);
            
        if (symbols.length > 0) {
            const expression = formatMathExpression(symbols);
            predictionContent.innerHTML = `<div class="math-expression">${expression}</div>`;
            
            // Try to evaluate the expression
            const evaluationResult = tryEvaluateExpression(symbols);
            if (evaluationResult !== null) {
                const resultElement = document.createElement('div');
                resultElement.className = 'evaluation-result';
                resultElement.innerHTML = `<span>=</span> <span class="result-value">${evaluationResult}</span>`;
                predictionContent.appendChild(resultElement);
            }
            
            // Remove filename info display - we no longer show this information
        } else {
            predictionContent.innerHTML = '<p class="no-symbols"><i class="fas fa-search"></i> No symbols detected</p>';
        }
    }
    
    // Show the result display
    resultDisplay.classList.remove('hidden');
}

// Format the math expression for better display
function formatMathExpression(symbols) {
    let formatted = '';
    
    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        
        // Handle special symbols
        switch (symbol) {
            case '√':
                formatted += `<span class="math-symbol sqrt">√</span>`;
                break;
            case 'π':
                formatted += `<span class="math-symbol pi">π</span>`;
                break;
            case '÷':
                formatted += `<span class="math-symbol operator">÷</span>`;
                break;
            case '×':
                formatted += `<span class="math-symbol operator">×</span>`;
                break;
            case '+':
                formatted += `<span class="math-symbol operator">+</span>`;
                break;
            case '-':
                formatted += `<span class="math-symbol operator">-</span>`;
                break;
            case '=':
                formatted += `<span class="math-symbol operator">=</span>`;
                break;
            case '∫':
                formatted += `<span class="math-symbol integral">∫</span>`;
                break;
            case 'sin':
            case 'cos':
            case 'tan':
            case 'log':
                formatted += `<span class="math-symbol function">${symbol}</span>`;
                break;
            default:
                if (/^[0-9]$/.test(symbol)) {
                    formatted += `<span class="math-symbol digit">${symbol}</span>`;
                } else {
                    formatted += `<span class="math-symbol">${symbol}</span>`;
                }
        }
    }
    
    return formatted;
}

// Try to evaluate the expression if it's a valid calculation
function tryEvaluateExpression(symbols) {
    try {
        // Convert mathematical symbols to JavaScript operators
        const jsExpression = symbols
            .join('')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/π/g, 'Math.PI')
            .replace(/√(\d+)/g, 'Math.sqrt($1)')
            .replace(/sin/g, 'Math.sin')
            .replace(/cos/g, 'Math.cos')
            .replace(/tan/g, 'Math.tan')
            .replace(/log/g, 'Math.log10');
        
        // Only evaluate if expression doesn't contain variables
        if (/[a-zA-Z]/.test(jsExpression) || !jsExpression.match(/[0-9]/)) {
            return null;
        }
        
        // Check if valid expression containing operators
        if (!jsExpression.match(/[\+\-\*\/=]/)) {
            return null;
        }
        
        // For expressions with equals, only evaluate the left side
        const parts = jsExpression.split('=');
        const result = eval(parts[0]);
        
        // Return formatted result
        return Number.isInteger(result) ? result : parseFloat(result.toFixed(4));
    } catch (e) {
        console.log("Cannot evaluate expression:", e);
        return null;
    }
}

// Close the result display
function closeResultDisplay() {
    document.getElementById('result-display').classList.add('hidden');
}

// --------- Loading Spinner ---------
function showLoading() { 
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('hidden');
    // Use a setTimeout to ensure the transition applies
    setTimeout(() => spinner.classList.add('visible'), 10);
}

function hideLoading() { 
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('visible');
    // Only actually hide it after the transition completes
    setTimeout(() => spinner.classList.add('hidden'), 300);
}

// --------- Real-time Sync ---------
canvas.on('path:created', (e) => {
    saveHistory();
    socket.emit('draw', e.path.toObject());
});

socket.on('draw', (pathObj) => {
    fabric.util.enlivenObjects([pathObj], ([obj]) => { canvas.add(obj); canvas.renderAll(); });
});

socket.on('clear', (data) => {
    // Only clear if someone else initiated it
    if (!data || data.initiator !== socket.id) {
        saveHistory();
        canvas.clear();
        canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));
    }
});

// --------- Handle Socket.io Connections ---------
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('userCount', (count) => {
    connectedUsers = count;
    updateUserCount();
});

function updateUserCount() {
    const usersCountEl = document.getElementById('users-count');
    usersCountEl.innerHTML = `<i class="fas fa-users"></i> ${connectedUsers} ${connectedUsers === 1 ? 'user' : 'users'} online`;
}

// --------- UI Setup ---------
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
const predictBtn = document.getElementById('predict-btn');
const clearBtn = document.getElementById('clear-btn');
const eraserBtn = document.getElementById('eraser-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const downloadBtn = document.getElementById('download-btn');
const closeResultBtn = document.getElementById('close-result-btn');

colorPicker.addEventListener('input', () => {
    if (!isErasing) canvas.freeDrawingBrush.color = colorPicker.value;
});

brushSize.addEventListener('input', () => {
    const size = brushSize.value;
    brushSizeValue.textContent = size;
    canvas.freeDrawingBrush.width = isErasing ? eraserSize : size;
});

predictBtn.addEventListener('click', getAnswer);
clearBtn.addEventListener('click', clearBoard);
eraserBtn.addEventListener('click', toggleEraser);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
downloadBtn.addEventListener('click', downLoad);
closeResultBtn.addEventListener('click', closeResultDisplay);

// --------- Download Feature ---------
function downLoad(){
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'whiteboard_drawing.png';
    link.click();
}

// --------- Keyboard Shortcuts ---------
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    else if (e.ctrlKey && e.key === 'a') { e.preventDefault(); getAnswer(); }
    else if (e.ctrlKey && e.key === 'e') { e.preventDefault(); toggleEraser(); }
    else if (e.ctrlKey && e.key === 'c') { e.preventDefault(); clearBoard(); }
    else if (e.ctrlKey && e.key === 'd') { e.preventDefault(); downLoad(); }
});

// --------- Touch Support ---------
canvas.on('touch:gesture', (e) => { canvas.isDrawingMode = true; });
canvas.on('touch:drag', (e) => { canvas.isDrawingMode = true; });

// --------- Responsive Canvas ---------
window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
    const container = document.querySelector('.canvas-container');
    if (container) {
        const width = container.clientWidth;
        canvas.setWidth(width);
        canvas.setHeight(window.innerHeight * 0.6);
        canvas.renderAll();
    }
}

// Initial setup
resizeCanvas();
updateUserCount();

// Save initial state
saveHistory();
