SET NAMES utf8mb4;

-- Keep catalog cover data in MySQL. The frontend should not own cover fallbacks.
-- This only fills empty covers and does not overwrite manually maintained URLs.
UPDATE games
SET cover_image_url = 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=640&q=80'
WHERE cover_image_url IS NULL OR TRIM(cover_image_url) = '';
