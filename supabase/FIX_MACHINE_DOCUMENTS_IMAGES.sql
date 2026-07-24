-- Unterlagen: PDF, Bilder und Text-Dokumente im Dokumenten-Bucket
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ],
  file_size_limit = 52428800
WHERE id = 'machine-documents';
