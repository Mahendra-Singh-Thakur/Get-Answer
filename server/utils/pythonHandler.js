const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Determine Python executable paths based on environment
function getPythonInterpreterPath() {
    // Check for environment variables first
    if (process.env.PYTHON_PATH) {
        return process.env.PYTHON_PATH;
    }

    const rootDir = path.resolve(__dirname, '../..');
    const isWindows = process.platform === 'win32';
    
    // Priority 1: Project virtual environment
    const venvPath = path.join(rootDir, 'myenv', 
                              isWindows ? 'Scripts/python.exe' : 'bin/python');
    if (fs.existsSync(venvPath)) {
        return venvPath;
    }
    
    // Priority 2: Check for Python 3 in standard locations
    if (isWindows) {
        // Common Windows locations
        const windowsPaths = [
            path.join(os.homedir(), 'AppData/Local/Programs/Python/Python3*/python.exe'),
            'C:/Python3*/python.exe',
            'C:/Program Files/Python3*/python.exe',
            'C:/Program Files (x86)/Python3*/python.exe'
        ];
        
        // Try to find Python using where command
        try {
            const { stdout } = exec('where python', { encoding: 'utf8', stdio: 'pipe' });
            if (stdout && stdout.trim()) {
                return stdout.trim().split('\n')[0];
            }
        } catch (e) {
            // Ignore errors
        }
    } else {
        // Unix-based systems
        try {
            const { stdout } = exec('which python3 || which python', { encoding: 'utf8', stdio: 'pipe' });
            if (stdout && stdout.trim()) {
                return stdout.trim();
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    // Priority 3: Default fallback
    return isWindows ? 'python' : 'python3';
}

exports.runPythonPrediction = (filename) => {
    return new Promise((resolve, reject) => {
        const rootDir = path.resolve(__dirname, '../..');
        const pythonScript = path.join(rootDir, 'python/main.py');
        const imagePath = path.join(rootDir, 'client/uploads', filename);
        
        // Get the appropriate Python interpreter
        const pythonInterpreter = getPythonInterpreterPath();
        
        // Check if the Python script and image path exist
        if (!fs.existsSync(pythonScript)) {
            return reject(`Python script not found: ${pythonScript}`);
        }
        if (!fs.existsSync(imagePath)) {
            return reject(`Image file not found: ${imagePath}`);
        }

        console.log("Running python on:", imagePath);
        console.log("Using interpreter:", pythonInterpreter);

        // Add timeout to prevent hanging
        const options = { timeout: 30000 }; // 30 second timeout
        
        exec(`"${pythonInterpreter}" "${pythonScript}" "${imagePath}"`, options, (error, stdout, stderr) => {
            if (stderr) console.warn('⚠️ Python STDERR (info):', stderr); // Just a warning, do not reject
            if (error) {
                // Provide clear error message based on error type
                if (error.code === 'ENOENT') {
                    return reject(`Python interpreter not found: ${pythonInterpreter}`);
                } else if (error.killed && error.signal === 'SIGTERM') {
                    return reject("Python process timed out after 30 seconds");
                }
                console.error('❌ Python error:', error.message);
                return reject("Python execution error: " + error.message);
            }

            console.log('✅ Python Output:', stdout);

            try {
                // Make sure we have valid JSON output
                if (!stdout || stdout.trim() === '') {
                    return reject("Empty output from Python script");
                }
                
                const output = JSON.parse(stdout.trim());
                
                // Check if we have an error message from Python
                if (output.error) {
                    console.error('❌ Python reported error:', output.error);
                    return reject(output.error);
                }
                
                resolve(output);
            } catch (parseErr) {
                console.error('❌ JSON Parse Error:', parseErr.message, 'Raw output:', stdout);
                reject("Invalid Python output: " + parseErr.message);
            }
        });
    });
};
