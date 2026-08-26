import { v2 as cloudinary } from 'cloudinary';
import { env, hasCloudinary } from './env.js';

/**
 * Cloudinary client. Configured once at import; `hasCloudinary` tells callers
 * whether it is usable at all, so a deployment with no image credentials degrades
 * to "reports without photos" rather than "every report submission fails".
 */
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export { cloudinary, hasCloudinary };
