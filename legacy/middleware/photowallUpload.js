import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs'; // Add this import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists
const photoWallDir = path.join(__dirname, '../public/uploads/photo_wall');
if (!fs.existsSync(photoWallDir)) {
    fs.mkdirSync(photoWallDir, { recursive: true });
    console.log('📁 Created photo wall upload directory:', photoWallDir);
}

// Storage configuration for photo wall
const photoWallStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, photoWallDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Sanitize filename
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const extension = path.extname(originalName) || '.png';
        cb(null, 'photo-' + uniqueSuffix + extension);
    }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

export const photoWallUpload = multer({
    storage: photoWallStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    }
});

// Add error handling middleware
export const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.redirect(req.get('referer') + '?error=File size too large. Maximum size is 5MB.');
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.redirect(req.get('referer') + '?error=Too many files uploaded.');
        }
    } else if (err) {
        return res.redirect(req.get('referer') + '?error=' + encodeURIComponent(err.message));
    }
    next();
};