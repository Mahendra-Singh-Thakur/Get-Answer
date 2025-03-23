const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Environment variables should be set up for production
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

module.exports = async function(req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');
  
  // Check if no token
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token, authorization denied'
    });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add user from payload
    req.user = decoded;
    
    // Check if user exists in database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid'
      });
    }
    
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token is not valid'
    });
  }
}; 