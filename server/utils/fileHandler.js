const fs = require('fs');
const path = require('path');

exports.saveImage = (imageBase64) => {
    return new Promise((resolve, reject) => {
        const uploadDir = path.join(__dirname, '../../client/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = `drawing_${Date.now()}.png`;
        const filepath = path.join(uploadDir, filename);
        const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '');

        fs.writeFile(filepath, base64Data, 'base64', (err) => {
            if (err) return reject('Failed to save image');
            resolve(filename);
        });
    });
};
