const jwt = require('jsonwebtoken');
const Member = require('../models/Member');

/**
 * Auth middleware - Extracts member from JWT token
 * Family-friendly: no passwords, just token-based session after joining
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please join a wedding first to access this feature'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if member still exists and is active
    const member = await Member.findById(decoded.id).populate('weddingId');
    
    if (!member) {
      return res.status(401).json({
        success: false,
        message: 'This member no longer exists'
      });
    }

    if (!member.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your access has been deactivated by the wedding admin'
      });
    }

    req.member = member;
    req.weddingId = member.weddingId._id || member.weddingId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please rejoin the wedding.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please rejoin.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Admin-only middleware
 */
const adminOnly = (req, res, next) => {
  if (req.member.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only the wedding admin can perform this action'
    });
  }
  next();
};

/**
 * Generate JWT for a member
 */
const generateToken = (memberId) => {
  return jwt.sign(
    { id: memberId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

module.exports = { protect, adminOnly, generateToken };
