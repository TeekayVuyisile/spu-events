const securityCheck = (req, res, next) => {
  if (req.session.security && req.session.security.userType === 'security') {
    res.locals.security = req.session.security;
  } else {
    res.locals.security = null;
  }
  next();
};

export default securityCheck;