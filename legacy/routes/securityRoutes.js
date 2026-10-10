import express from 'express';
const router = express.Router();
import securityController from '../controllers/securityController.js';
import securityAuth from '../middleware/securityAuth.js';

// Public routes (no authentication required)
router.get('/register', securityController.showRegister);
router.post('/register', securityController.register);
router.get('/login', securityController.showLogin);
router.post('/login', securityController.login);
router.get('/logout', securityController.logout);
// Add these to your existing securityRoutes.js
router.get('/scan', securityAuth, securityController.showScanner);
router.post('/scan/process', securityAuth, securityController.processScan);
router.get('/scan/result', securityAuth, securityController.showScanResult);

// Protected routes (require security authentication)
router.get('/dashboard', securityAuth, securityController.dashboard);

export default router;