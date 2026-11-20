const multer = require("multer");
const { HttpError } = require("../utils/helpers");

// Memory storage: files go straight to Cloudinary, nothing is written to disk
// (serverless hosts have no persistent disk).
const imageUpload = (maxFiles, maxMb) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) cb(null, true);
      else cb(new HttpError(400, "Only JPG, PNG, WebP, GIF or AVIF images are allowed"));
    },
  });

module.exports = { imageUpload };
