// Middleware to check if user has the required role
const checkRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: 'Not authorized' });
    }
    
    if (req.user.role !== role) {
      return res.status(403).json({ msg: `Access denied. ${role} role required` });
    }
    
    next();
  };
};

module.exports = {
  checkRole
};