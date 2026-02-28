const securityAuth = (req, res, next) => {
  if (req.session.security && req.session.security.userType === 'security') {
    next();
  } else {
    res.redirect('/security/login');
  }
};

export default securityAuth;