import cv2
import numpy as np
from utils.constants import CLASS_NAMES

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
    image_data = cv2.imread(image_path)
    if image_data is None:
        return None, None
    gray = cv2.cvtColor(image_data, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return image_data, contours
