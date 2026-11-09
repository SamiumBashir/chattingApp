import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './uploads.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validateRequest } from '../../middlewares/validate.js';
import { signatureRequestSchema, uploadCompleteSchema } from '../../validators/upload.validator.js';
import { validateUploadedFile, MAX_FILE_SIZE_BYTES } from '../../utils/fileValidation.js';
import { AppError } from '../../utils/apiResponse.js';

const router = Router();

// Configure multer memory storage with strict 25MB file limit and MIME/extension filtering
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES, // 25 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const validation = validateUploadedFile(file.originalname, file.mimetype);
    if (!validation.valid) {
      return cb(
        new AppError(
          validation.error || 'Invalid file format',
          400,
          validation.code || 'UNSUPPORTED_FILE_TYPE'
        )
      );
    }
    cb(null, true);
  },
});

// Protect all upload routes
router.use(authenticate);

router.post('/signature', validateRequest({ body: signatureRequestSchema }), UploadController.getSignature);
router.post('/complete', validateRequest({ body: uploadCompleteSchema }), UploadController.completeUpload);
router.post('/direct', upload.single('file'), UploadController.directUpload);
router.delete('/:publicId', UploadController.deleteAsset);

export default router;
