import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'tasks',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'org_id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'priority', type: 'string' },
        { name: 'due_date', type: 'number' },
        { name: 'completion_notes', type: 'string', isOptional: true },
        { name: 'completion_photo_urls', type: 'string', isOptional: true }, // JSON array stringified
        { name: 'completion_gps_lat', type: 'number', isOptional: true },
        { name: 'completion_gps_lng', type: 'number', isOptional: true },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'task_type_color', type: 'string' },
        { name: 'task_type_name_es', type: 'string' },
        { name: 'block_names_es', type: 'string', isOptional: true }, // JSON array stringified
        { name: 'updated_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'blocks',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'org_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'crop_type', type: 'string' },
        { name: 'is_organic', type: 'boolean' },
        { name: 'geometry_json', type: 'string', isOptional: true },
      ]
    }),
    tableSchema({
      name: 'pest_species',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'name_en', type: 'string' },
        { name: 'name_es', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'applicable_crops', type: 'string' }, // JSON array string
        { name: 'is_allowed_in_organic', type: 'boolean' },
      ]
    }),
    tableSchema({
      name: 'scouting_logs',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'org_id', type: 'string' },
        { name: 'block_id', type: 'string' },
        { name: 'pest_species_id', type: 'string', isOptional: true },
        { name: 'rating', type: 'string' },
        { name: 'count_per_sample', type: 'number', isOptional: true },
        { name: 'observation_notes', type: 'string', isOptional: true },
        { name: 'gps_lat', type: 'number', isOptional: true },
        { name: 'gps_lng', type: 'number', isOptional: true },
        { name: 'scouted_at', type: 'number' },
        { name: 'sync_status', type: 'string' }, // 'synced' | 'pending'
      ]
    })
  ]
});
