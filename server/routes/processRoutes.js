const express = require('express');
const { processImage } = require('../controllers/processController');  // ✅ Import controller

const router = express.Router();

router.post('/process', processImage); // ✅ Define route for processing images

module.exports = router;
