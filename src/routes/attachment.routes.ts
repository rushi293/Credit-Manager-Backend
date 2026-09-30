import { Router } from 'express';
import multer from 'multer';
import { uploadAttachment, getAttachmentFile, deleteAttachment } from '../controllers/attachment.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WebP formats are allowed'));
    }
  }
});

router.use(requireAuth);

router.post('/bills/:billId', upload.single('file'), uploadAttachment);
router.get('/:id', getAttachmentFile);
router.delete('/:id', deleteAttachment);

export default router;
