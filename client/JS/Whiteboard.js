// Whiteboard.js - Fully featured collaborative whiteboard

// Get the auth token for identifying the user
const authToken = localStorage.getItem('authToken');
let userId = null;

// Initialize Socket.io with auth credentials
const socket = io({
    auth: {
        token: authToken,
        userId: userId
    }
});

// Store the current room ID
let currentRoomId = null;

// Parse URL parameters to check for a shared room
const urlParams = new URLSearchParams(window.location.search);
const sharedRoomId = urlParams.get('room');

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

// Variables for selection area
let isSelectingArea = false;
let selectionStartX, selectionStartY;
let selectionRect = null;

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
    // If we're in selection mode, use the selection for prediction
    if (!canvas.isDrawingMode) {
        useSelectionForPrediction();
        return;
    }
    
    // When in drawing mode, auto-select all objects
    const objects = canvas.getObjects().filter(obj => obj.isDrawnPath || obj.type === 'text');
    
    if (objects.length === 0) {
        showMessage('No objects to recognize. Draw something first.');
        return;
    }
    
    // Store current canvas view state
    const viewportTransform = canvas.viewportTransform.slice();
    const zoom = canvas.getZoom();
    
    // Switch to selection mode without changing zoom
    const wasInDrawingMode = canvas.isDrawingMode;
    if (wasInDrawingMode) {
        // Toggle without resetting zoom
        canvas.isDrawingMode = false;
        canvas.selection = true;
        
        // Update objects' selectability
        canvas.forEachObject(function(obj) {
            if (obj.isDrawnPath) {
                obj.selectable = true;
                obj.evented = true;
            }
        });
        
        // Update UI
        selectionBtn.classList.toggle('primary', !canvas.isDrawingMode);
        selectionBtn.innerHTML = '<i class="fas fa-pen"></i> Draw Mode';
        updatePredictButtonText();
    }
    
    // Create a selection with all objects
    const allObjectsGroup = new fabric.ActiveSelection(objects, {
        canvas: canvas
    });
    
    // Set as active selection
    canvas.setActiveObject(allObjectsGroup);
    
    // Restore the original viewport transform to prevent zoom changes
    canvas.setViewportTransform(viewportTransform);
    canvas.setZoom(zoom);
    canvas.renderAll();
    
    // Show the selection preview directly
    showObjectSelectionPreview(allObjectsGroup);
}

// Create a temporary selection rectangle for visualization
function createTemporarySelectionRect(left, top, width, height) {
    // Remove any existing selection rectangle
    if (selectionRect) {
        canvas.remove(selectionRect);
    }
    
    // Create selection rectangle
    selectionRect = new fabric.Rect({
        left: left,
        top: top,
        width: width,
        height: height,
        fill: 'rgba(67, 97, 238, 0.2)',
        stroke: 'rgba(67, 97, 238, 0.8)',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false
    });
    
    canvas.add(selectionRect);
    canvas.renderAll();
}

function showSelectionPreview() {
    // Get the background color selected by the user
    const bgColor = predictionBgColor.value || '#FFFFFF';
    
    // Calculate selection boundaries with padding to ensure full digits are captured
    const padding = 15; // Match the padding used in processSelectedArea
    const left = Math.max(0, Math.round(selectionRect.left) - padding);
    const top = Math.max(0, Math.round(selectionRect.top) - padding);
    const width = Math.min(canvas.width - left, Math.round(selectionRect.width) + padding * 2);
    const height = Math.min(canvas.height - top, Math.round(selectionRect.height) + padding * 2);
    
    // Create a temporary canvas for the cropped area
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw user-selected background
    tempCtx.fillStyle = bgColor;
    tempCtx.fillRect(0, 0, width, height);
    
    // Draw the selected portion from the main canvas to the temp canvas
    const mainCanvas = canvas.getElement();
    tempCtx.drawImage(mainCanvas, left, top, width, height, 0, 0, width, height);
    
    // Draw an indicator for the original selection (without padding)
    // This helps the user understand what area was initially selected vs the padded area
    const originalLeft = selectionRect.left - left;
    const originalTop = selectionRect.top - top;
    const originalWidth = selectionRect.width;
    const originalHeight = selectionRect.height;
    
    tempCtx.strokeStyle = 'rgba(67, 97, 238, 0.5)';
    tempCtx.setLineDash([5, 5]);
    tempCtx.strokeRect(originalLeft, originalTop, originalWidth, originalHeight);
    
    // Get data URL from the temp canvas for preview
    const dataURL = tempCanvas.toDataURL('image/png');
    
    // Create the preview panel
    const previewPanel = document.createElement('div');
    previewPanel.id = 'selection-preview';
    
    // Add preview title
    const title = document.createElement('h3');
    title.textContent = 'Selection Preview (with added padding)';
    previewPanel.appendChild(title);
    
    // Add image preview
    const previewImage = document.createElement('img');
    previewImage.src = dataURL;
    previewImage.alt = 'Selection Preview';
    previewImage.style.border = '1px solid #ccc';
    previewPanel.appendChild(previewImage);
    
    // Add description about the background color
    const description = document.createElement('p');
    description.innerHTML = `The dashed line shows your original selection. <br>Using <span style="display:inline-block; width:12px; height:12px; background:${bgColor}; border:1px solid #ccc;"></span> background for prediction.`;
    description.style.fontSize = '0.9rem';
    description.style.color = '#555';
    description.style.textAlign = 'center';
    description.style.margin = '10px 0';
    previewPanel.appendChild(description);
    
    // Add buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'btn-container';
    
    // Create predict button
    const predictButton = document.createElement('button');
    predictButton.textContent = 'Predict (Enter)';
    predictButton.className = 'btn primary';
    predictButton.onclick = confirmPreview;
    
    // Create retry button
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry Selection (R)';
    retryButton.className = 'btn';
    retryButton.onclick = retrySelection;
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel (Esc)';
    cancelButton.className = 'btn danger';
    cancelButton.onclick = cancelPreview;
    
    // Add buttons to container
    buttonsContainer.appendChild(predictButton);
    buttonsContainer.appendChild(retryButton);
    buttonsContainer.appendChild(cancelButton);
    
    // Add buttons container to panel
    previewPanel.appendChild(buttonsContainer);
    
    // Add panel to document body
    document.body.appendChild(previewPanel);
    
    // Add keyboard shortcut handler
    const keyHandler = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmPreview();
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            retrySelection();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelPreview();
        }
    };
    
    document.addEventListener('keydown', keyHandler);
    
    // Functions for button actions
    function confirmPreview() {
        document.removeEventListener('keydown', keyHandler);
        document.body.removeChild(previewPanel);
        processSelectedArea();
    }
    
    function retrySelection() {
        document.removeEventListener('keydown', keyHandler);
        document.body.removeChild(previewPanel);
        
        // Properly remove the selection rectangle from the canvas
        if (selectionRect) {
            canvas.remove(selectionRect);
            canvas.renderAll();
        }
        
        // Complete cleanup
        selectionRect = null;
        
        // Reset selection mode flag
        isSelectingArea = false;
        
        // Then restart area selection
        startAreaSelection();
    }
    
    function cancelPreview() {
        document.removeEventListener('keydown', keyHandler);
        document.body.removeChild(previewPanel);
        
        // Just cancel the selection without changing zoom
        if (selectionRect) {
            canvas.remove(selectionRect);
            canvas.renderAll();
            selectionRect = null;
        }
        
        // Reset selection mode flag
        isSelectingArea = false;
    }
}

function processSelectedArea() {
    if (!selectionRect) return;
    
    // Show loading spinner
    showLoading();
    
    // Get the background color selected by the user
    const bgColor = predictionBgColor.value || '#FFFFFF';
    
    // Calculate selection boundaries with extra padding to ensure full digits are captured
    const padding = 15; // Add more padding around the selection
    const left = Math.max(0, Math.round(selectionRect.left) - padding);
    const top = Math.max(0, Math.round(selectionRect.top) - padding);
    const width = Math.min(canvas.width - left, Math.round(selectionRect.width) + padding * 2);
    const height = Math.min(canvas.height - top, Math.round(selectionRect.height) + padding * 2);
    
    // Store the selection area for future reference
    window.lastSelectionArea = {
        left: left,
        top: top,
        width: width,
        height: height,
        center: {
            x: left + width/2,
            y: top + height/2
        },
        originalRect: {
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height
        },
        bgColor: bgColor
    };
    
    // Add custom background to eliminate alpha channel
    const bg = new fabric.Rect({
        left: 0,
        top: 0,
        width: canvas.width,
        height: canvas.height,
        fill: bgColor,
        selectable: false,
        evented: false
    });
    canvas.add(bg);
    canvas.sendToBack(bg);
    canvas.renderAll();
    
    // Create a temporary canvas for the cropped area
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the selected portion from the main canvas to the temp canvas
    const mainCanvas = canvas.getElement();
    tempCtx.drawImage(mainCanvas, left, top, width, height, 0, 0, width, height);
    
    // Get data URL from the temp canvas
    const dataURL = tempCanvas.toDataURL('image/png');
    
    // Remove temporary background and selection rectangle
    canvas.remove(bg);
    canvas.remove(selectionRect);
    canvas.renderAll();
    
    // Reset selection mode
    isSelectingArea = false;
    selectionRect = null;
    
    // Send to backend
    fetch('/process', {
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
            
            // Add button to print symbols onto whiteboard
            const printButton = document.createElement('button');
            printButton.className = 'btn primary';
            printButton.innerHTML = '<i class="fas fa-print"></i> Print to Whiteboard';
            printButton.onclick = () => {
                printSymbolsToWhiteboard(symbols, evaluationResult);
                resultDisplay.classList.add('hidden'); // Hide the result panel after printing
            };
            
            // Add button container
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'button-container';
            buttonContainer.appendChild(printButton);
            predictionContent.appendChild(buttonContainer);
        } else {
            predictionContent.innerHTML = '<p class="no-symbols"><i class="fas fa-search"></i> No symbols detected</p>';
        }
    }
    
    // Show the result display
    resultDisplay.classList.remove('hidden');
}

// New function to print symbols to the whiteboard
function printSymbolsToWhiteboard(symbols, evaluationResult) {
    // Save current state for undo
    saveHistory();
    
    // Create a text object with the symbols joined together
    let text = symbols.join(' ');
    
    // Add evaluation result if available
    if (evaluationResult !== null) {
        text += ' = ' + evaluationResult;
    }
    
    // Calculate position - use the stored selection area if available
    let posX = canvas.width / 2;
    let posY = canvas.height / 2;
    let fontSize = 30;
    
    // Use the last selection area for positioning - use the exact coordinates
    if (window.lastSelectionArea) {
        // Use exact center of the selection area for position
        posX = window.lastSelectionArea.center.x;
        posY = window.lastSelectionArea.top + window.lastSelectionArea.height + 20;
        
        // Adjust font size based on selection width
        const selectionWidth = window.lastSelectionArea.width;
        fontSize = Math.max(20, Math.min(50, selectionWidth / Math.max(1, text.length) * 1.2));
    } else if (selectionRect) {
        // Fallback to current selection rect if available
        posX = selectionRect.left + selectionRect.width / 2;
        posY = selectionRect.top + selectionRect.height + 30;
        
        // Adjust font size based on selection width
        fontSize = Math.max(20, Math.min(50, selectionRect.width / Math.max(1, text.length) * 1.2));
    }
    
    // Make sure text doesn't go off canvas
    posY = Math.min(posY, canvas.height - 50);
    
    // Create a new Fabric.js text object
    const textObject = new fabric.Text(text, {
        left: posX,
        top: posY,
        fontSize: fontSize,
        fill: colorPicker.value, // Use current color
        fontFamily: 'Arial',
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: true,
        hasBorders: true,
        lockUniScaling: false,
        centeredScaling: true,
        centeredRotation: true,
        borderColor: 'rgba(67, 97, 238, 0.5)',
        cornerColor: 'rgba(67, 97, 238, 1)',
        cornerSize: 12,
        transparentCorners: false,
        padding: 10,
        // Add shadow to make text stand out better against drawings
        shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.2)',
            blur: 5,
            offsetX: 2,
            offsetY: 2
        })
    });
    
    // Add to canvas
    canvas.add(textObject);
    canvas.setActiveObject(textObject);
    
    // Temporarily enable object selection on canvas
    const previousSelectionState = canvas.selection;
    const previousDrawingMode = canvas.isDrawingMode;
    canvas.selection = true;
    canvas.isDrawingMode = false;
    
    // Add a message to guide the user
    showMessage('Text added! You can now move, resize, or rotate it. Double-click to edit. Click elsewhere to continue drawing.');
    
    // Set up one-time event handler to restore drawing mode when user clicks elsewhere
    canvas.once('mouse:down', function(options) {
        if (options.target !== textObject) {
            canvas.isDrawingMode = previousDrawingMode;
            canvas.selection = previousSelectionState;
            hideMessage();
        }
    });
    
    // Update canvas
    canvas.renderAll();
    
    // Emit the change to other users
    socket.emit('draw', {
        type: 'object',
        object: JSON.stringify(canvas),
        sender: socket.id
    });
}

// Function to show a temporary message to the user
function showMessage(text) {
    // Create or get the message element
    let messageEl = document.getElementById('canvas-message');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.id = 'canvas-message';
        messageEl.style.position = 'absolute';
        messageEl.style.top = '10px';
        messageEl.style.left = '50%';
        messageEl.style.transform = 'translateX(-50%)';
        messageEl.style.background = 'rgba(0,0,0,0.7)';
        messageEl.style.color = 'white';
        messageEl.style.padding = '10px 20px';
        messageEl.style.borderRadius = '5px';
        messageEl.style.zIndex = '50';
        messageEl.style.transition = 'opacity 0.3s ease';
        messageEl.style.pointerEvents = 'none';
        document.querySelector('.canvas-container').appendChild(messageEl);
    }
    
    messageEl.textContent = text;
    messageEl.style.opacity = '1';
}

function hideMessage() {
    const messageEl = document.getElementById('canvas-message');
    if (messageEl) {
        messageEl.style.opacity = '0';
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 300);
    }
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
canvas.on('path:created', function(e) {
    const path = e.path;
    // Make the path selectable with the selection tool, but not in drawing mode
    path.selectable = false; 
    
    // Store the path on a custom property so we can toggle it later
    path.isDrawnPath = true;
    
    // Save state for undo functionality
    saveHistory();

    // Emit to other users
    socket.emit('draw', {
        type: 'path',
        path: path.path,
        color: path.stroke,
        width: path.strokeWidth,
        sender: socket.id
    });
});

socket.on('draw', (data) => {
    if (data.sender !== socket.id) { // Ignore events from self
        if (data.type === 'path') {
            // For drawing paths (freehand drawing)
            const path = new fabric.Path(data.path);
            path.set({
                stroke: data.color,
                strokeWidth: data.width,
                fill: null,
                selectable: false
            });
            canvas.add(path);
            canvas.renderAll();
        } else if (data.type === 'object') {
            // For objects (like text)
            canvas.loadFromJSON(data.object, canvas.renderAll.bind(canvas));
        }
    }
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
    console.log('Connected to server with ID:', socket.id);
    
    // If we have a shared room ID from URL, join that room
    if (sharedRoomId) {
        joinRoom(sharedRoomId);
    } else {
        // By default, each user is in their own personal room (their socket ID)
        currentRoomId = socket.id;
        showMessage(`You're in your personal whiteboard. Share using room ID: ${currentRoomId}`);
    }
    
    // Try to get the user ID from the auth token
    if (authToken) {
        fetchUserInfo(authToken)
            .then(user => {
                if (user && user.id) {
                    userId = user.id;
                    socket.auth.userId = userId;
                    console.log('Authenticated as user:', userId);
                }
            })
            .catch(err => console.error('Failed to get user info:', err));
    }
});

// Handle room joining confirmation
socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    
    // Update UI to show the current room
    showMessage(`Joined shared whiteboard room: ${currentRoomId}`);
    
    // Update URL without reloading the page
    const newUrl = window.location.pathname + '?room=' + currentRoomId;
    window.history.pushState({ path: newUrl }, '', newUrl);
});

// Process user count updates
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
const selectionBtn = document.getElementById('selection-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const predictionBgColor = document.getElementById('prediction-bg-color');
const helpBtn = document.getElementById('help-btn');
const closeHelpBtn = document.getElementById('close-help-btn');
const helpModal = document.getElementById('help-modal');
const shareBtn = document.getElementById('share-btn') || createShareButton();
const joinRoomBtn = document.getElementById('join-room-btn') || createJoinRoomButton();

// Create share button if it doesn't exist
function createShareButton() {
    const btn = document.createElement('button');
    btn.id = 'share-btn';
    btn.className = 'toolbar-button';
    btn.innerHTML = '<i class="fas fa-share-alt"></i> Share';
    btn.title = 'Share this whiteboard';
    
    // Insert after the download button
    if (downloadBtn && downloadBtn.parentNode) {
        downloadBtn.parentNode.insertBefore(btn, downloadBtn.nextSibling);
    } else {
        document.querySelector('.toolbar').appendChild(btn);
    }
    
    return btn;
}

// Create join room button if it doesn't exist
function createJoinRoomButton() {
    const btn = document.createElement('button');
    btn.id = 'join-room-btn';
    btn.className = 'toolbar-button';
    btn.innerHTML = '<i class="fas fa-door-open"></i> Join Room';
    btn.title = 'Join an existing whiteboard room';
    
    // Insert after the share button
    if (shareBtn && shareBtn.parentNode) {
        shareBtn.parentNode.insertBefore(btn, shareBtn.nextSibling);
    } else {
        document.querySelector('.toolbar').appendChild(btn);
    }
    
    return btn;
}

// Create room UI modal
function createRoomModal() {
    // Check if modal already exists
    if (document.getElementById('room-modal')) {
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'room-modal';
    modal.className = 'modal hidden';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Collaborate on Whiteboard</h3>
                <button id="close-room-modal" class="close-button">&times;</button>
            </div>
            <div class="modal-body">
                <div class="input-group">
                    <label for="room-id-input">Room ID</label>
                    <input type="text" id="room-id-input" placeholder="Enter room ID to join">
                </div>
                <div class="button-group">
                    <button id="confirm-join-room" class="primary-button">Join Room</button>
                    <button id="create-share-link" class="secondary-button">Copy Share Link</button>
                </div>
                <p id="room-status" class="room-status"></p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Set up event listeners
    document.getElementById('close-room-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    document.getElementById('confirm-join-room').addEventListener('click', () => {
        const roomId = document.getElementById('room-id-input').value.trim();
        if (roomId) {
            joinRoom(roomId);
            document.getElementById('room-status').textContent = `Joining room: ${roomId}...`;
        } else {
            document.getElementById('room-status').textContent = 'Please enter a valid room ID.';
        }
    });
    
    document.getElementById('create-share-link').addEventListener('click', () => {
        const shareUrl = createShareableLink();
        document.getElementById('room-id-input').value = shareUrl;
        document.getElementById('room-status').textContent = 'Share link copied to clipboard!';
    });
    
    return modal;
}

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
selectionBtn.addEventListener('click', toggleSelectionMode);
if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        if (canvas.isDrawingMode) {
            toggleSelectionMode();
        }
        selectAllObjects();
    });
}

// Help button functionality
helpBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
});

closeHelpBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
});

// Close help modal when clicking outside the content
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
        helpModal.classList.add('hidden');
    }
});

// Close help modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close any open modals
        const modals = document.querySelectorAll('.modal:not(.hidden)');
        if (modals.length > 0) {
            modals.forEach(modal => modal.classList.add('hidden'));
            e.preventDefault(); // Prevent other escape handlers
        }
    }
});

// Share button functionality
shareBtn.addEventListener('click', () => {
    // Create the room modal if it doesn't exist
    const roomModal = document.getElementById('room-modal') || createRoomModal();
    
    // Update the input with the current room ID
    const roomIdInput = document.getElementById('room-id-input');
    if (roomIdInput) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId || socket.id}`;
        roomIdInput.value = shareUrl;
    }
    
    // Show the modal
    roomModal.classList.remove('hidden');
    
    // Focus on the input
    if (roomIdInput) roomIdInput.focus();
});

// Join room button functionality
joinRoomBtn.addEventListener('click', () => {
    // Create the room modal if it doesn't exist
    const roomModal = document.getElementById('room-modal') || createRoomModal();
    
    // Clear the input
    const roomIdInput = document.getElementById('room-id-input');
    if (roomIdInput) {
        roomIdInput.value = '';
    }
    
    // Show the modal
    roomModal.classList.remove('hidden');
    
    // Focus on the input
    if (roomIdInput) roomIdInput.focus();
});

// Create the room modal on page load
document.addEventListener('DOMContentLoaded', function() {
    createRoomModal();
    
    // Add CSS for the modal if not already in CSS files
    if (!document.getElementById('room-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'room-modal-styles';
        style.textContent = `
            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                opacity: 1;
                transition: opacity 0.3s ease;
            }
            
            .modal.hidden {
                opacity: 0;
                pointer-events: none;
            }
            
            .modal-content {
                background-color: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
                animation: zoomIn 0.3s ease;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                border-bottom: 1px solid #e9ecef;
            }
            
            .modal-header h3 {
                margin: 0;
                color: #2980b9;
            }
            
            .close-button {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #6c757d;
            }
            
            .modal-body {
                padding: 1rem;
            }
            
            .input-group {
                margin-bottom: 1rem;
            }
            
            .input-group label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
            }
            
            .input-group input {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid #ced4da;
                border-radius: 4px;
            }
            
            .button-group {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 1rem;
            }
            
            .primary-button, .secondary-button {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
            }
            
            .primary-button {
                background-color: #2980b9;
                color: white;
            }
            
            .secondary-button {
                background-color: #e9ecef;
                color: #212529;
            }
            
            .room-status {
                margin-top: 1rem;
                color: #6c757d;
                font-size: 0.9rem;
            }
            
            @keyframes zoomIn {
                from {
                    transform: scale(0.9);
                    opacity: 0;
                }
                to {
                    transform: scale(1);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
});

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
    else if (e.ctrlKey && e.key === 'p') { e.preventDefault(); getAnswer(); }
    else if (e.ctrlKey && e.key === 'e') { e.preventDefault(); toggleEraser(); }
    else if (e.ctrlKey && e.key === 's') { e.preventDefault(); toggleSelectionMode(); }
    else if (e.ctrlKey && e.key === 'a') { e.preventDefault(); 
        if (canvas.isDrawingMode) toggleSelectionMode(); 
        selectAllObjects(); 
    }
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
updatePredictButtonText();

// Save initial state
saveHistory();

// Set up canvas events for object manipulation
canvas.on('mouse:down', function(options) {
    if (options.target && options.target.type === 'text') {
        // If clicking on a text object, switch to selection mode
        if (canvas.isDrawingMode) {
            // Remember drawing state to restore later
            canvas._lastDrawingMode = true;
            canvas.isDrawingMode = false;
        }
    } else if (!options.target && canvas._lastDrawingMode) {
        // If clicking on empty space and we were previously drawing
        canvas.isDrawingMode = true;
        canvas._lastDrawingMode = false;
    }
});

// Add double-click handler for text editing
canvas.on('mouse:dblclick', function(options) {
    if (options.target && options.target.type === 'text') {
        const textObj = options.target;
        
        // Enter editing mode
        textObj.enterEditing();
        textObj.selectAll();
        
        // Show editing indicator
        showMessage('Editing text. Click elsewhere when done.');
        
        // Set up event for when editing exits
        textObj.on('editing:exited', function() {
            hideMessage();
            
            // Make sure the changes are saved in history
            saveHistory();
            
            // Emit to other users
            socket.emit('draw', {
                type: 'object',
                object: JSON.stringify(canvas),
                sender: socket.id
            });
        });
    }
});

// --------- Selection Mode ---------
function toggleSelectionMode() {
    // First disable eraser if it's active
    if (isErasing) {
        toggleEraser();
    }
    
    // Store current canvas view state
    const viewportTransform = canvas.viewportTransform.slice();
    const zoom = canvas.getZoom();
    
    // Toggle drawing mode
    canvas.isDrawingMode = !canvas.isDrawingMode;
    
    // Toggle selection of objects
    canvas.selection = !canvas.isDrawingMode;
    
    // Toggle selectability of all paths based on mode
    canvas.forEachObject(function(obj) {
        if (obj.isDrawnPath) {
            obj.selectable = !canvas.isDrawingMode;
            obj.evented = !canvas.isDrawingMode;
        }
    });
    
    // Restore the original viewport transform to prevent zoom changes
    canvas.setViewportTransform(viewportTransform);
    canvas.setZoom(zoom);
    
    // Update predict button text
    updatePredictButtonText();
    
    // Update button appearance
    selectionBtn.classList.toggle('primary', !canvas.isDrawingMode);
    selectionBtn.innerHTML = !canvas.isDrawingMode ? 
        '<i class="fas fa-pen"></i> Draw Mode' : 
        '<i class="fas fa-mouse-pointer"></i> Select';
    
    // Show a helpful message
    if (!canvas.isDrawingMode) {
        showMessage('Selection mode: Click to select, move and resize objects. Click "Use Selection" to predict.');
    } else {
        showMessage('Drawing mode: You can now draw freely.');
        setTimeout(hideMessage, 2000);
    }
}

// Update UI for both selection techniques
function updatePredictButtonText() {
    // Update the predict button text based on mode
    if (canvas.isDrawingMode) {
        predictBtn.innerHTML = '<i class="fas fa-magic"></i> Auto Select';
    } else {
        predictBtn.innerHTML = '<i class="fas fa-magic"></i> Use Selection';
    }
}

// New function to select all objects on canvas
function selectAllObjects() {
    // Store current canvas view state
    const viewportTransform = canvas.viewportTransform.slice();
    const zoom = canvas.getZoom();
    
    // Deselect any currently selected objects
    canvas.discardActiveObject();
    
    // Get all selectable objects on the canvas
    const objects = canvas.getObjects().filter(obj => obj.isDrawnPath || obj.type === 'text');
    
    if (objects.length === 0) {
        showMessage('No objects to select. Draw something first.');
        return false;
    }
    
    // Create a new group with all objects
    const allObjectsGroup = new fabric.ActiveSelection(objects, {
        canvas: canvas
    });
    
    // Set as active selection
    canvas.setActiveObject(allObjectsGroup);
    
    // Restore the original viewport transform to prevent zoom changes
    canvas.setViewportTransform(viewportTransform);
    canvas.setZoom(zoom);
    canvas.renderAll();
    
    showMessage('All objects selected. Click "Use Selection" to predict.');
    return true;
}

// Enhanced useSelectionForPrediction function 
function useSelectionForPrediction() {
    // Check if we're in selection mode
    if (canvas.isDrawingMode) {
        // Store current canvas view state before switching
        const viewportTransform = canvas.viewportTransform.slice();
        const zoom = canvas.getZoom();
        
        // If not in selection mode, switch to it (using our custom toggle that preserves zoom)
        toggleSelectionMode();
        
        // Restore the original viewport transform to prevent zoom changes
        canvas.setViewportTransform(viewportTransform);
        canvas.setZoom(zoom);
        canvas.renderAll();
        
        showMessage('Now in selection mode. Select objects by dragging around them, then click "Use Selection" again.');
        return;
    }
    
    // Get currently selected objects
    let activeSelection = canvas.getActiveObject();
    
    // If nothing is selected, try to select all objects
    if (!activeSelection && !selectAllObjects()) {
        return; // selectAllObjects will show appropriate message
    }
    
    // Get the updated active selection after selectAllObjects
    activeSelection = canvas.getActiveObject();
    
    // Show a preview of just the selected objects
    showObjectSelectionPreview(activeSelection);
}

// New function to preview only the selected objects
function showObjectSelectionPreview(selection) {
    // Create a temporary canvas for the selected objects
    const tempCanvas = document.createElement('canvas');
    
    // Get the background color selected by the user
    const bgColor = document.getElementById('prediction-bg-color').value || '#FFFFFF';
    
    // Get the bounding box of the selection (for sizing the temp canvas)
    const bounds = selection.getBoundingRect();
    const padding = 15;
    
    // Set temp canvas dimensions with padding
    tempCanvas.width = bounds.width + padding * 2;
    tempCanvas.height = bounds.height + padding * 2;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw user-selected background
    tempCtx.fillStyle = bgColor;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Clone the selection to avoid modifying the original
    const clonedObjects = [];
    
    if (selection.type === 'activeSelection') {
        // Group selection - handle multiple objects
        selection.forEachObject(obj => {
            const clone = fabric.util.object.clone(obj);
            // Adjust position relative to selection bounds
            clone.left = obj.left - bounds.left + padding;
            clone.top = obj.top - bounds.top + padding;
            clonedObjects.push(clone);
        });
    } else {
        // Single object selection
        const clone = fabric.util.object.clone(selection);
        clone.left = padding;
        clone.top = padding;
        clonedObjects.push(clone);
    }
    
    // Create a temporary canvas with fabric
    const tempFabricCanvas = new fabric.StaticCanvas();
    tempFabricCanvas.setWidth(tempCanvas.width);
    tempFabricCanvas.setHeight(tempCanvas.height);
    
    // Set background color for the fabric canvas too
    tempFabricCanvas.setBackgroundColor(bgColor, tempFabricCanvas.renderAll.bind(tempFabricCanvas));
    
    // Add the cloned objects to the temp canvas
    clonedObjects.forEach(obj => tempFabricCanvas.add(obj));
    tempFabricCanvas.renderAll();
    
    // Get data URL from the temp canvas
    const dataURL = tempFabricCanvas.toDataURL('image/png');
    
    // Create the preview panel
    const previewPanel = document.createElement('div');
    previewPanel.id = 'selection-preview';
    
    // Add preview title
    const title = document.createElement('h3');
    title.textContent = 'Selected Objects Preview';
    previewPanel.appendChild(title);
    
    // Add image preview
    const previewImage = document.createElement('img');
    previewImage.src = dataURL;
    previewImage.alt = 'Selection Preview';
    previewImage.style.border = '1px solid #ccc';
    previewPanel.appendChild(previewImage);
    
    // Add description
    const description = document.createElement('p');
    description.textContent = 'These are your selected objects that will be processed for prediction.';
    description.style.fontSize = '0.9rem';
    description.style.color = '#555';
    description.style.textAlign = 'center';
    description.style.margin = '10px 0';
    previewPanel.appendChild(description);
    
    // Add buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'btn-container';
    
    // Create predict button
    const predictButton = document.createElement('button');
    predictButton.textContent = 'Predict (Enter)';
    predictButton.className = 'btn primary';
    predictButton.onclick = () => {
        document.removeEventListener('keydown', keyHandler);
        document.body.removeChild(previewPanel);
        processObjectSelection(selection, bounds, padding, bgColor);
    };
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel (Esc)';
    cancelButton.className = 'btn danger';
    cancelButton.onclick = () => {
        document.removeEventListener('keydown', keyHandler);
        document.body.removeChild(previewPanel);
        
        // Maintain zoom level by properly handling the selection
        // Don't discard the active object to maintain selection
    };
    
    // Add buttons to container
    buttonsContainer.appendChild(predictButton);
    buttonsContainer.appendChild(cancelButton);
    
    // Add buttons container to panel
    previewPanel.appendChild(buttonsContainer);
    
    // Add panel to document body
    document.body.appendChild(previewPanel);
    
    // Add keyboard shortcut handler
    const keyHandler = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            predictButton.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelButton.click();
        }
    };
    
    document.addEventListener('keydown', keyHandler);
}

// Process the object selection
function processObjectSelection(selection, bounds, padding, bgColor) {
    // Show loading spinner
    showLoading();
    
    // Store the selection area for future reference
    window.lastSelectionArea = {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        center: {
            x: bounds.left + bounds.width/2,
            y: bounds.top + bounds.height/2
        },
        bgColor: bgColor
    };
    
    // Create a temporary canvas for the selected objects
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.width + padding * 2;
    tempCanvas.height = bounds.height + padding * 2;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw user-selected background
    tempCtx.fillStyle = bgColor;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Clone the selection to avoid modifying the original
    const clonedObjects = [];
    
    if (selection.type === 'activeSelection') {
        // Group selection - handle multiple objects
        selection.forEachObject(obj => {
            const clone = fabric.util.object.clone(obj);
            // Adjust position relative to selection bounds
            clone.left = obj.left - bounds.left + padding;
            clone.top = obj.top - bounds.top + padding;
            clonedObjects.push(clone);
        });
    } else {
        // Single object selection
        const clone = fabric.util.object.clone(selection);
        clone.left = padding;
        clone.top = padding;
        clonedObjects.push(clone);
    }
    
    // Create a temporary canvas with fabric
    const tempFabricCanvas = new fabric.StaticCanvas();
    tempFabricCanvas.setWidth(tempCanvas.width);
    tempFabricCanvas.setHeight(tempCanvas.height);
    
    // Set background color for the fabric canvas
    tempFabricCanvas.setBackgroundColor(bgColor, tempFabricCanvas.renderAll.bind(tempFabricCanvas));
    
    // Add the cloned objects to the temp canvas
    clonedObjects.forEach(obj => tempFabricCanvas.add(obj));
    tempFabricCanvas.renderAll();
    
    // Get data URL from the temp canvas
    const dataURL = tempFabricCanvas.toDataURL('image/png');
    
    // Send to backend
    fetch('/process', {
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

// Function to join a specific room
function joinRoom(roomId) {
    if (roomId && roomId !== currentRoomId) {
        socket.emit('joinRoom', roomId);
        showMessage(`Joining room: ${roomId}...`);
    }
}

// Function to create a shareable link
function createShareableLink() {
    // Use the current room ID or the socket ID if no room is set
    const roomToShare = currentRoomId || socket.id;
    const shareableUrl = `${window.location.origin}${window.location.pathname}?room=${roomToShare}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareableUrl)
        .then(() => {
            showMessage('Shareable link copied to clipboard!');
        })
        .catch(err => {
            console.error('Failed to copy link:', err);
            showMessage('Failed to copy link. URL: ' + shareableUrl);
        });
    
    return shareableUrl;
}

// Async function to get user info from token
async function fetchUserInfo(token) {
    try {
        const response = await fetch('/api/auth/me', {
            method: 'GET',
            headers: {
                'x-auth-token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.user;
        } else {
            console.error('Token validation failed:', data.message);
            return null;
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
        return null;
    }
}
