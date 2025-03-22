import cv2
import numpy as np
from keras.models import load_model

def process_prediction(image_path):
    """Process the image and return predictions with post-processing"""
    # Load the model
    model = load_model("model/math_symbols_model.h5")
    
    # Read and preprocess the image
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Process to find contours (assuming this code exists)
    # ... existing contour detection code ...
    
    predictions = []
    confidence_scores = []
    
    # For each contour, predict the symbol
    for contour in contours:
        # Extract the symbol
        x, y, w, h = cv2.boundingRect(contour)
        symbol = gray[y:y+h, x:x+w]
        
        # Preprocess for the model
        symbol = cv2.resize(symbol, (28, 28))
        symbol = symbol / 255.0
        symbol = np.reshape(symbol, (1, 28, 28, 1))
        
        # Make prediction
        pred = model.predict(symbol)
        class_index = np.argmax(pred)
        confidence = float(pred[0][class_index])
        
        # Map index to actual symbol
        symbol_map = {0: '0', 1: '1', /* ... other mappings ... */}
        predicted_symbol = symbol_map[class_index]
        
        # Store prediction and position
        predictions.append({
            'symbol': predicted_symbol,
            'position': (x, y),
            'confidence': confidence
        })
        confidence_scores.append(confidence)
    
    # Sort predictions by x-coordinate to get correct order
    predictions.sort(key=lambda p: p['position'][0])
    
    # Step 2: Post-Processing - Filter by confidence
    CONFIDENCE_THRESHOLD = 0.7
    filtered_predictions = [p for p in predictions if p['confidence'] >= CONFIDENCE_THRESHOLD]
    
    # Extract symbols for expression
    expression = ''.join([p['symbol'] for p in filtered_predictions])
    
    # Step 3-4: Assemble and validate expression
    try:
        # Basic validation - ensure expression can be parsed
        parsed_expression = expression.replace('x', '*').replace('÷', '/')
        
        # Step 5: Evaluate expression
        result = str(eval(parsed_expression)) if parsed_expression else "Cannot evaluate"
    except Exception as e:
        result = f"Error: {str(e)}"
    
    # Return both the expression and result
    return {
        'expression': expression,
        'result': result,
        'confidence': sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    } 