-- Widen the room-images bucket mime allowlist to include HEIC/HEIF.
-- Most iPhones export images as image/heic; we convert to JPEG client-side
-- via heic2any, but some Safari paths (or direct API uploads) may preserve
-- the original mime — accept both so the upload doesn't 400.
update storage.buckets
   set allowed_mime_types = array[
     'image/png',
     'image/jpeg',
     'image/webp',
     'image/gif',
     'image/heic',
     'image/heif',
     'image/heic-sequence'
   ]
 where id = 'room-images';
