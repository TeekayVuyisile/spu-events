const adminAuth = (req, res, next) => {
  if (req.session.admin && req.session.admin.userType === 'admin') {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

export default adminAuth;