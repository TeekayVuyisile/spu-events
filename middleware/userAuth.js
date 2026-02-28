const userAuth = (req, res, next) => {
  if (req.session.user && req.session.user.userType === 'user') {
    next();
  } else {
    res.redirect('/user/login');
  }
};

export default userAuth;