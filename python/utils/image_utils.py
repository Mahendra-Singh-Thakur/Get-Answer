import cv2
import numpy as np
from utils.constants import CLASS_NAMES
import sys

def preprocess_image_array(img_array):
    img_resized = cv2.resize(img_array, (224, 224), interpolation=cv2.INTER_NEAREST)
    img_normalized = img_resized.astype(np.float32) / 255.0
    return np.expand_dims(img_normalized, axis=0)

def predict(model, img_array):
    image_batch = preprocess_image_array(img_array)
    predictions = model.predict(image_batch, verbose=0)
    predicted_class_index = np.argmax(predictions)
    return CLASS_NAMES[list(CLASS_NAMES.keys())[predicted_class_index]]

def find_contours(image_path):
    print(f"Processing image: {image_path}", file=sys.stderr)
    
    image_data = cv2.imread(image_path)
    if image_data is None:
        print("Failed to read image", file=sys.stderr)
        return None, None
        
    # Convert to grayscale efficiently
    gray = cv2.cvtColor(image_data, cv2.COLOR_BGR2GRAY)
    
    # Enhance image for better contour detection in smaller areas
    # Apply bilateral filter to reduce noise while preserving edges
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)
    
    # Apply adaptive thresholding for better results on smaller areas
    binary = cv2.adaptiveThreshold(
        filtered, 
        255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 
        11, 
        2
    )
    
    # Enhance using morphological operations
    kernel = np.ones((2, 2), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    
    # Find contours with different retrieval mode for better results
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    print(f"Found {len(contours)} contours", file=sys.stderr)
    
    # Filter contours by size and shape
    valid_contours = []
    min_contour_size = 3  # More permissive minimum size
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        
        # Filter out very small contours but allow smaller ones for selected areas
        if w > min_contour_size and h > min_contour_size:
            # Calculate aspect ratio to filter out non-symbolic shapes
            aspect_ratio = float(w) / h if h > 0 else 0
            
            # Most math symbols have aspect ratios between 0.2 and 5
            if 0.1 <= aspect_ratio <= 6.0:
                valid_contours.append(contour)
    
    print(f"Using {len(valid_contours)} valid contours after filtering", file=sys.stderr)
    
    return image_data, valid_contours
