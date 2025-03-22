import sys
import os
import json
import cv2
import traceback

# Suppress TensorFlow logs and stderr
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import tensorflow as tf
tf.get_logger().setLevel('ERROR')

# Keep a copy of stderr for error reporting
original_stderr = sys.stderr
sys.stderr = open(os.devnull, 'w')

def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "No image path provided"}), file=original_stderr)
            sys.exit(1)

        image_path = sys.argv[1]
        
        # Check if the file exists
        if not os.path.exists(image_path):
            print(json.dumps({"error": f"Image path does not exist: {image_path}"}), file=original_stderr)
            sys.exit(1)

        # Import these here to avoid tensorflow import issues
        from model.loader import load_model
        from utils.image_utils import find_contours, predict

        image_data, contours = find_contours(image_path)

        if image_data is None or contours is None:
            print(json.dumps({"error": "Failed to process image or find contours"}), file=original_stderr)
            sys.exit(1)

        # Load the model
        try:
            model = load_model()
        except Exception as e:
            print(json.dumps({"error": f"Failed to load model: {str(e)}"}), file=original_stderr)
            print(traceback.format_exc(), file=original_stderr)
            sys.exit(1)
            
        predictions = {}

        if len(contours) == 0:
            predictions["message"] = "No symbols detected"
        else:
            for i, contour in enumerate(sorted(contours, key=lambda c: cv2.boundingRect(c)[0])):
                x, y, w, h = cv2.boundingRect(contour)
                margin = 4
                x_start, y_start = max(x - margin, 0), max(y - margin, 0)
                x_end, y_end = min(x + w + margin, image_data.shape[1]), min(y + h + margin, image_data.shape[0])
                cropped = image_data[y_start:y_end, x_start:x_end]
                if cropped.shape[0] < 5 or cropped.shape[1] < 5:
                    continue
                symbol = predict(model, cropped)
                predictions[f"symbol_{i + 1}"] = symbol

        # Restore stderr and print predictions
        sys.stderr.close()
        sys.stderr = original_stderr
        print(json.dumps(predictions))
        
    except Exception as e:
        # In case of any unexpected error
        print(json.dumps({"error": f"Unexpected error: {str(e)}"}), file=original_stderr)
        print(traceback.format_exc(), file=original_stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
