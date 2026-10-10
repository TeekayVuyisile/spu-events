const adminCheck = (req, res, next) => {
  if (req.session.admin && req.session.admin.userType === 'admin') {
    res.locals.admin = req.session.admin;
  } else {
    res.locals.admin = null;
  }
  next();
};

export default adminCheck;