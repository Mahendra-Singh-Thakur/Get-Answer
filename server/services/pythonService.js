const { exec } = require('child_process');
const path = require('path');

exports.runPythonPrediction = (filename) => {
    return new Promise((resolve, reject) => {
        const filepath = path.join(__dirname, '../public/uploads', filename);
        exec(`python3 predict_from_image.py "${filepath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Prediction Error: ${error.message}`);
                return reject("Failed to predict");
            }

            try {
                const output = JSON.parse(stdout); // Assuming Python returns JSON
                console.log(`✅ Prediction: ${output.prediction}`);
                resolve(output.prediction);
            } catch (parseError) {
                console.error(`❌ JSON Parse Error: ${parseError.message}`);
                reject("Invalid prediction output");
            }
        });
    });
};
