INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Navel Orangeworm',
  'Gusano Naranja Naval',
  'Amyelois transitella',
  'insect',
  ARRAY['almond'],
  'Escalate when trap pressure rises into hull split or field samples trend upward.',
  false,
  'https://ipm.ucanr.edu/agriculture/almond/navel-orangeworm/',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Navel Orangeworm'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Aphids',
  'Pulgones',
  'Aphididae',
  'insect',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Track hot spots and beneficial activity before treatment decisions.',
  true,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Aphids'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Spider Mites',
  'Arana Roja',
  'Tetranychidae',
  'mite',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Escalate when colonies expand and leaf feeding becomes visible.',
  true,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Spider Mites'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Citrus Thrips',
  'Trips de los Citricos',
  'Scirtothrips citri',
  'insect',
  ARRAY['navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Watch fruitlet feeding injury during sensitive flush periods.',
  false,
  'https://ipm.ucanr.edu/agriculture/citrus/citrus-thrips/',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Citrus Thrips'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Scale',
  'Escama',
  'Coccoidea',
  'insect',
  ARRAY['navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Inspect limbs and fruit for crawler activity and coverage.',
  false,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Scale'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Alternaria',
  'Alternaria',
  'Alternaria alternata',
  'disease',
  ARRAY['mandarin', 'lemon', 'navel_orange', 'valencia_orange', 'grapefruit'],
  'Escalate when lesion pressure shows up with humid weather windows.',
  true,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Alternaria'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Weed Pressure',
  'Presion de Maleza',
  NULL,
  'weed',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Document row middles and berm escapes before they spread.',
  true,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Weed Pressure'
);

INSERT INTO "pest_species" (
  "name_en",
  "name_es",
  "name_scientific",
  "category",
  "applicable_crops",
  "action_threshold_description",
  "is_allowed_in_organic",
  "uc_ipm_url",
  "is_system"
)
SELECT
  'Lady Beetles',
  'Mariquitas',
  'Coccinellidae',
  'beneficial',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  'Log beneficial presence to support monitor-only recommendations.',
  true,
  'https://ipm.ucanr.edu',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "pest_species" WHERE "name_en" = 'Lady Beetles'
);
