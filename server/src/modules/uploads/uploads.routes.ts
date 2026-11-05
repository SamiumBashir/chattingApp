import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './uploads.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { signatureRequestSchema, uploadCompleteSchema } from '../../validators/upload.validator.js';

const router = Router();

// Configure multer memory storage with 25MB file limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
});

// Protect all upload routes
router.use(authenticate);

router.post('/signature', validateRequest({ body: signatureRequestSchema }), UploadController.getSignature);
router.post('/complete', validateRequest({ body: uploadCompleteSchema }), UploadController.completeUpload);
router.post('/direct', upload.single('file'), UploadController.directUpload);
router.delete('/:publicId', UploadController.deleteAsset);

export default router;
