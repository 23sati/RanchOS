INSERT INTO "task_types" ("name_en", "name_es", "color", "icon", "is_system")
SELECT seed.name_en, seed.name_es, seed.color, seed.icon, true
FROM (
  VALUES
    ('General', 'General', '#6B7280', 'clipboard-list'),
    ('Irrigation', 'Riego', '#0284C7', 'droplets'),
    ('Spray', 'Aplicacion', '#F97316', 'spray-can'),
    ('Fertilize', 'Fertilizacion', '#65A30D', 'flask-conical'),
    ('Scout', 'Monitoreo', '#8B5CF6', 'binoculars'),
    ('Harvest', 'Cosecha', '#CA8A04', 'tractor')
) AS seed(name_en, name_es, color, icon)
WHERE NOT EXISTS (
  SELECT 1
  FROM "task_types" existing
  WHERE existing."org_id" IS NULL
    AND existing."is_system" = true
    AND existing."name_en" = seed.name_en
);
