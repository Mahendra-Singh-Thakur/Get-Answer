const { saveImage } = require('../utils/fileHandler');
const { runPythonPrediction } = require('../utils/pythonHandler'); // Correct relative import

exports.processImage = async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ error: "No image provided" });

        // Save image
        const filename = await saveImage(image);
        console.log(`✅ Image saved as ${filename}`);

        // Run Python prediction
        const prediction = await runPythonPrediction(filename);
        
        // Merge the prediction results with the filename
        return res.json({ 
            ...prediction, 
            filename 
        });

    } catch (error) {
        console.error("❌ Error processing image:", error);
        return res.status(500).json({ error: "Failed to process image", details: error.toString() });
    }
};
