-- Unterlagen: auch Bilder im Dokumenten-Bucket erlauben (optional, falls genutzt)
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ],
  file_size_limit = 52428800
WHERE id = 'machine-documents';
