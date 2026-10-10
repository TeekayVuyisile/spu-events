import express from 'express';
const router = express.Router();
import userController from '../controllers/userController.js';
import userAuth from '../middleware/userAuth.js';
import { photoWallUpload, handleUploadErrors } from '../middleware/photowallUpload.js'; // Add handleUploadErrors

// User authentication routes
router.get('/signup', userController.showSignup);
router.post('/signup', userController.signup);
router.get('/login', userController.showLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);

// User protected routes
router.get('/dashboard', userAuth, userController.dashboard);

// Events routes
router.get('/events', userAuth, userController.events);
router.get('/event/:id', userAuth, userController.viewEvent);
router.post('/event/:id/like', userAuth, userController.likeEvent);
router.post('/event/:id/buy-ticket', userAuth, userController.buyTicket);
router.post('/event/:id/volunteer', userAuth, userController.applyVolunteer);

// Photo wall routes - MOVE THESE TOGETHER
router.get('/event/:id/photos', userAuth, userController.photoWall);
router.post('/event/:id/photos/upload', 
    userAuth, 
    photoWallUpload.single('photo'),
    handleUploadErrors, // Add this line
    userController.uploadPhoto
);
router.post('/photo/:id/heart', userAuth, userController.heartPhoto);
router.put('/photo/:id/caption', userAuth, userController.editPhotoCaption);
router.delete('/photo/:id', userAuth, userController.deletePhoto);
router.post('/photo/:id/report', userAuth, userController.reportPhoto);
// Ticket routes
router.get('/tickets', userAuth, userController.tickets);
router.get('/ticket/:id', userAuth, userController.viewTicket);
// Wallet routes
router.get('/wallet', userAuth, userController.wallet);
router.post('/wallet/deposit', userAuth, userController.processDeposit);
router.post('/wallet/withdraw', userAuth, userController.processWithdrawal);
// Notification routes
router.get('/notifications', userAuth, userController.notifications);
router.post('/notification/:id/read', userAuth, userController.markNotificationRead);
router.post('/notifications/read-all', userAuth, userController.markAllNotificationsRead);
// Comment routes
router.post('/comment', userAuth, userController.addComment);
router.put('/comment/:id/edit', userAuth, userController.editComment);
router.delete('/comment/:id', userAuth, userController.deleteComment);
router.post('/comment/:id/react', userAuth, userController.addCommentReaction);
router.post('/comment/:id/report', userAuth, userController.reportComment);

export default router;