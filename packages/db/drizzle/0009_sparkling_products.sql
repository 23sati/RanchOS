INSERT INTO "products" (
  "product_name",
  "manufacturer",
  "epa_reg_number",
  "rei_hours",
  "phi_days",
  "formulation",
  "applicable_crops",
  "target_pests",
  "restricted_use",
  "is_omri_listed",
  "is_cdfa_organic"
)
SELECT
  'Intrepid 2F',
  'Corteva',
  '62719-442',
  4,
  14,
  'Flowable',
  ARRAY['almond'],
  ARRAY['Navel Orangeworm'],
  false,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM "products" WHERE "product_name" = 'Intrepid 2F'
);

INSERT INTO "products" (
  "product_name",
  "manufacturer",
  "epa_reg_number",
  "rei_hours",
  "phi_days",
  "formulation",
  "applicable_crops",
  "target_pests",
  "restricted_use",
  "is_omri_listed",
  "is_cdfa_organic"
)
SELECT
  'Entrust SC',
  'Corteva',
  '62719-541',
  4,
  1,
  'Suspension Concentrate',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  ARRAY['Citrus Thrips', 'Aphids'],
  false,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "products" WHERE "product_name" = 'Entrust SC'
);

INSERT INTO "products" (
  "product_name",
  "manufacturer",
  "epa_reg_number",
  "rei_hours",
  "phi_days",
  "formulation",
  "applicable_crops",
  "target_pests",
  "restricted_use",
  "is_omri_listed",
  "is_cdfa_organic"
)
SELECT
  'Cinnerate',
  'Brandt',
  '80824-1',
  4,
  0,
  'Botanical',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  ARRAY['Spider Mites', 'Aphids'],
  false,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "products" WHERE "product_name" = 'Cinnerate'
);

INSERT INTO "products" (
  "product_name",
  "manufacturer",
  "epa_reg_number",
  "rei_hours",
  "phi_days",
  "formulation",
  "applicable_crops",
  "target_pests",
  "restricted_use",
  "is_omri_listed",
  "is_cdfa_organic"
)
SELECT
  'Urea Ammonium Nitrate 32%',
  'Generic',
  NULL,
  NULL,
  NULL,
  'Liquid fertilizer',
  ARRAY['almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit'],
  ARRAY[]::text[],
  false,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM "products" WHERE "product_name" = 'Urea Ammonium Nitrate 32%'
);
