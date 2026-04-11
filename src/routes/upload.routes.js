const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { protect } = require('../middleware/auth');

// Multer memory storage
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only jpg, png, webp images are allowed.'), false);
    }
    cb(null, true);
  },
});

// POST /api/upload/image (Single Base64)
router.post('/image', protect, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
    
    // Convert buffer to base64 string natively
    const base64Data = req.file.buffer.toString('base64');
    const url = `data:${req.file.mimetype};base64,${base64Data}`;
    
    res.json({ success: true, url, publicId: req.file.originalname });
  } catch (err) { next(err); }
});

// POST /api/upload/images (Multiple Base64)
router.post('/images', protect, upload.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images provided.' });
    }

    // Convert all buffers to Base64 formatted urls
    const images = req.files.map((f) => {
      const base64Data = f.buffer.toString('base64');
      return { 
        url: `data:${f.mimetype};base64,${base64Data}`, 
        publicId: f.originalname 
      };
    });

    res.json({ success: true, images });
  } catch (err) { next(err); }
});

// DELETE /api/upload/:publicId
router.delete('/:publicId', protect, async (req, res, next) => {
  try {
    // Base64 images are embedded directly in the DB, so we don't need to delete them from a cloud provider.
    // They will be deleted when the Product document updates or deletes.
    res.json({ success: true, message: 'Image considered deleted locally.' });
  } catch (err) { next(err); }
});

module.exports = router;
