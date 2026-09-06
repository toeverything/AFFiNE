UPDATE ai_sessions_metadata
SET prompt_name = CASE prompt_name
  WHEN 'Search With AFFiNE AI' THEN 'Chat With AFFiNE AI'
  WHEN 'debug:action:dalle3' THEN 'Generate image'
  WHEN 'debug:action:fal-sd15' THEN 'Generate image'
  WHEN 'debug:action:gpt-image-1' THEN 'Generate image'
  WHEN 'debug:action:fal-remove-bg' THEN 'Remove background'
  WHEN 'debug:action:fal-upscaler' THEN 'Upscale image'
  WHEN 'debug:action:fal-face-to-sticker' THEN 'Convert to sticker'
  ELSE prompt_name
END
WHERE prompt_name IN (
  'Search With AFFiNE AI',
  'debug:action:dalle3',
  'debug:action:fal-sd15',
  'debug:action:gpt-image-1',
  'debug:action:fal-remove-bg',
  'debug:action:fal-upscaler',
  'debug:action:fal-face-to-sticker'
);
