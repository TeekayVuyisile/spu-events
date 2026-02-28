import express from 'express';
const router = express.Router();
import adminController from '../controllers/adminController.js';
import adminAuth from '../middleware/adminAuth.js';
import upload from '../middleware/upload.js';

// Admin authentication routes
router.get('/signup', adminController.showSignup);
router.post('/signup', adminController.signup);
router.get('/login', adminController.showLogin);
router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

// Admin protected routes
router.get('/dashboard', adminAuth, adminController.dashboard);
// Events routes
router.get('/event', adminAuth, adminController.events);
router.get('/event/add', adminAuth, adminController.showAddEvent);
// Update the add event route to include file upload
router.post('/event/add', adminAuth, upload.single('cover_image'), adminController.addEvent);
// Show edit event form
router.get('/event/:id/edit', adminAuth, adminController.showEditEvent);
// Update event
router.post('/event/:id/edit', adminAuth, upload.single('cover_image'), adminController.updateEvent);

// Admin protected routes
router.get('/dashboard', adminAuth, adminController.dashboard);
// View event
router.get('/event/:id', adminAuth, adminController.viewEvent);
// Add this route after your existing event routes
router.post('/event/:id/cancel', adminAuth, adminController.cancelEvent);
// Comment routes
router.post('/comment', adminAuth, adminController.addComment);
router.put('/comment/:id/edit', adminAuth, adminController.editComment);
router.delete('/comment/:id', adminAuth, adminController.deleteComment);
router.post('/comment/:id/reaction', adminAuth, adminController.addReaction);
router.delete('/comment/:id/reaction', adminAuth, adminController.removeReaction);
// Attendee list routes
router.get('/event/:id/attendees', adminAuth, adminController.viewAttendees);
// Volunteer management routes
router.get('/event/:id/volunteers', adminAuth, adminController.viewVolunteers);
router.post('/event/:id/volunteer/:volunteerId/accept', adminAuth, adminController.acceptVolunteer);
router.post('/event/:id/volunteer/:volunteerId/decline', adminAuth, adminController.declineVolunteer);
router.post('/event/:id/volunteers/accept-all', adminAuth, adminController.acceptAllVolunteers);
router.post('/event/:id/volunteers/decline-all', adminAuth, adminController.declineAllVolunteers);
// Ticket management routes (placeholders for now)
// router.get('/ticket/:id/assign', adminAuth, (req, res) => {
//   // This will be implemented later
//   res.render('admin/assign_ticket', { 
//     ticketId: req.params.id,
//     userId: req.query.user_id,
//     eventId: req.query.event_id
//   });
// });

// router.get('/ticket/:id/view', adminAuth, (req, res) => {
//   // This will be implemented later
//   res.render('admin/view_ticket', { 
//     ticketId: req.params.id
//   });
// });
// View ticket routes
router.get('/ticket/:id/view', adminAuth, adminController.showViewTicket);
router.post('/ticket/:id/scan', adminAuth, adminController.markTicketScanned);
router.post('/ticket/:id/reset', adminAuth, adminController.resetTicket);

// Wallet management routes
router.get('/wallets', adminAuth, adminController.manageWallets);
router.get('/user/:id/deposit', adminAuth, adminController.showDeposit);
router.post('/user/:id/deposit', adminAuth, adminController.processDeposit);
router.get('/user/:id/withdraw', adminAuth, adminController.showWithdrawal);
router.post('/user/:id/withdraw', adminAuth, adminController.processWithdrawal);
// Ticket assignment routes
router.get('/ticket/:id/assign', adminAuth, adminController.showAssignTicket);
router.post('/ticket/:id/assign', adminAuth, adminController.assignTicket);
// Photo wall routes for admin
router.get('/event/:id/photos', adminAuth, adminController.photoWall);
router.delete('/photo/:id', adminAuth, adminController.deletePhoto);

// User management routes
router.get('/users', adminAuth, adminController.manageUsers);
router.get('/user/:id', adminAuth, adminController.viewUser);
router.post('/user/:id/ban', adminAuth, adminController.banUser);
router.post('/user/:id/unban', adminAuth, adminController.unbanUser);
router.post('/user/:id/delete', adminAuth, adminController.deleteUser);
// Report management routes
router.get('/reports', adminAuth, adminController.manageReports);
router.get('/report/:id', adminAuth, adminController.viewReport);
router.post('/report/:id/status', adminAuth, adminController.updateReportStatus);
router.post('/report/:id/delete-comment', adminAuth, adminController.deleteReportedComment);
// // Photo wall route (placeholder for now)
// router.get('/event/:id/photos', adminAuth, (req, res) => {
//   res.render('admin/photo_wall', { eventId: req.params.id });
// });

export default router;