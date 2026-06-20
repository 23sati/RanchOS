import { pgTable, text, timestamp, uuid, boolean, decimal, pgEnum, index, integer, date, primaryKey, unique, jsonb, AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const localeEnum = pgEnum('locale', ['en', 'es']);
export const cropEnum = pgEnum('primary_crop', ['almond', 'citrus', 'both']);
export const certificationBodyEnum = pgEnum('certification_body', ['ccof', 'ocia', 'oregon_tilth', 'primus', 'other']);
export const userRoleEnum = pgEnum('role', ['owner', 'manager', 'crew']);
export const subscriptionPlanEnum = pgEnum('plan', ['starter', 'growth', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('status', ['trialing', 'active', 'past_due', 'canceled', 'unpaid']);

export const countyEnum = pgEnum('county', ['Fresno','Tulare','Kings','Kern','Madera','Merced','San Joaquin','San Bernardino','Riverside','Ventura']);
export const blockCropEnum = pgEnum('block_crop_type', ['almond','navel_orange','valencia_orange','lemon','mandarin','grapefruit']);
export const irrigationEnum = pgEnum('irrigation_type', ['drip','micro_spray','flood','overhead']);
export const taskStatusEnum = pgEnum('task_status', ['pending','in_progress','completed','overdue']);
export const taskPriorityEnum = pgEnum('task_priority', ['low','normal','high','urgent']);
export const notificationDeliveryChannelEnum = pgEnum('notification_delivery_channel', ['push', 'email']);
export const notificationDeliveryStatusEnum = pgEnum('notification_delivery_status', ['pending', 'deferred', 'sent', 'failed', 'canceled']);
export const inventoryCategoryEnum = pgEnum('inventory_category', ['fertilizer', 'pesticide', 'soil_amendment', 'fuel', 'irrigation', 'parts', 'packaging', 'tool', 'safety', 'other']);
export const inventoryUnitEnum = pgEnum('inventory_unit', ['gallon', 'quart', 'pound', 'ounce', 'ton', 'bag', 'case', 'each', 'foot', 'bin']);
export const inventoryLocationTypeEnum = pgEnum('inventory_location_type', ['warehouse', 'shop', 'yard', 'field', 'vehicle', 'cold_storage', 'other']);
export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', ['purchase', 'transfer', 'usage', 'adjustment_in', 'adjustment_out', 'return', 'waste']);

export const user = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

export const session = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => ({
  tokenIdx: index('sessions_token_idx').on(table.token),
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
}));

export const account = pgTable('accounts', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerAccountUnq: unique('accounts_provider_account_unq').on(table.providerId, table.accountId),
  userIdIdx: index('accounts_user_id_idx').on(table.userId),
}));

export const verification = pgTable('verifications', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  identifierIdx: index('verifications_identifier_idx').on(table.identifier),
}));

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  locale: text('locale', { enum: ['en', 'es'] }).notNull().default('en'),
  primaryCrop: text('primary_crop', { enum: ['almond', 'citrus', 'both'] }),
  hasOrganicBlocks: boolean('has_organic_blocks').default(false),
  certificationBody: text('certification_body', { enum: ['ccof', 'ocia', 'oregon_tilth', 'primus', 'other'] }),
  certificationNumber: text('certification_number'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // matches Better Auth user.id
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['owner', 'manager', 'crew'] }).notNull(),
  preferredLocale: text('preferred_locale', { enum: ['en', 'es'] }).notNull().default('en'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  expoPushToken: text('expo_push_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references((): AnyPgColumn => profiles.id),
}, (table) => ({
  orgIdIdx: index('profiles_org_id_idx').on(table.orgId),
  orgRoleIdx: index('profiles_role_idx').on(table.orgId, table.role),
}));

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  plan: text('plan', { enum: ['starter', 'growth', 'enterprise'] }).notNull().default('starter'),
  status: text('status', { enum: ['trialing', 'active', 'past_due', 'canceled', 'unpaid'] }).notNull().default('trialing'),
  totalAcres: decimal('total_acres', { precision: 10, scale: 2 }),
  mobileSeats: text('mobile_seats').default('5'), // Phase 0 says 5, stored as decimal/int? Instruction says 5.
  monthlyAmountCents: text('monthly_amount_cents'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }).default(sql`NOW() + INTERVAL '14 days'`),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const ranches = pgTable('ranches', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  county: text('county', { enum: ['Fresno','Tulare','Kings','Kern','Madera','Merced','San Joaquin','San Bernardino','Riverside','Ventura'] }),
  address: text('address'),
  gpsLat: decimal('gps_lat', { precision: 10, scale: 8 }),
  gpsLng: decimal('gps_lng', { precision: 11, scale: 8 }),
  mapViewport: jsonb('map_viewport'),
  boundary: jsonb('boundary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdIdx: index('ranches_org_id_idx').on(table.orgId),
}));

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  ranchId: uuid('ranch_id').notNull().references(() => ranches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  cropType: text('crop_type', { enum: ['almond','navel_orange','valencia_orange','lemon','mandarin','grapefruit'] }).notNull(),
  variety: text('variety').notNull(),
  acreage: decimal('acreage', { precision: 10, scale: 2 }),
  treeCount: integer('tree_count'),
  yearPlanted: integer('year_planted'),
  rootstock: text('rootstock'),
  irrigationType: text('irrigation_type', { enum: ['drip','micro_spray','flood','overhead'] }),
  geometry: jsonb('geometry'),
  isOrganic: boolean('is_organic').notNull().default(false),
  organicSince: date('organic_since'),
  apn: text('apn'),
  waterDistrict: text('water_district'),
  gsaName: text('gsa_name'),
  notes: text('notes'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgIdIdx: index('blocks_org_id_idx').on(table.orgId),
  ranchIdIdx: index('blocks_ranch_id_idx').on(table.ranchId),
  isOrganicIdx: index('blocks_is_organic_idx').on(table.orgId, table.isOrganic),
}));

export const blockSeasons = pgTable('block_seasons', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  seasonYear: integer('season_year').notNull(),
  bloomDate: date('bloom_date'),
  hullSplitStart: date('hull_split_start'),
  harvestStart: date('harvest_start'),
  harvestEnd: date('harvest_end'),
  totalYieldLbs: decimal('total_yield_lbs', { precision: 12, scale: 2 }),
  yieldPerAcre: decimal('yield_per_acre', { precision: 8, scale: 2 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  unq: unique().on(table.blockId, table.seasonYear),
}));

export const taskTypes = pgTable('task_types', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  color: text('color').notNull().default('#6B7280'),
  icon: text('icon'),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  taskTypeId: uuid('task_type_id').notNull().references(() => taskTypes.id),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: date('due_date').notNull(),
  status: text('status', { enum: ['pending','in_progress','completed','overdue'] }).notNull().default('pending'),
  priority: text('priority', { enum: ['low','normal','high','urgent'] }).notNull().default('normal'),
  createdBy: uuid('created_by').notNull().references(() => profiles.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by').references(() => profiles.id),
  completionNotes: text('completion_notes'),
  completionPhotoUrls: text('completion_photo_urls').array().default(sql`'{}'`),
  completionGpsLat: decimal('completion_gps_lat', { precision: 10, scale: 8 }),
  completionGpsLng: decimal('completion_gps_lng', { precision: 11, scale: 8 }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgIdStatusIdx: index('tasks_org_id_status_idx').on(table.orgId, table.status),
  dueDateIdx: index('tasks_due_date_idx').on(table.orgId, table.dueDate),
}));

export const taskBlocks = pgTable('task_blocks', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.taskId, table.blockId] }),
  blockIdIdx: index('task_blocks_block_id_idx').on(table.blockId),
}));

export const taskAssignments = pgTable('task_assignments', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.taskId, table.profileId] }),
  profileIdIdx: index('task_assignments_profile_id_idx').on(table.profileId),
}));

export const cimisStations = pgTable('cimis_stations', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  county: text('county'),
  lat: decimal('lat', { precision: 10, scale: 8 }),
  lng: decimal('lng', { precision: 11, scale: 8 }),
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
});

export const etData = pgTable('et_data', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  stationId: integer('station_id').notNull().references(() => cimisStations.id),
  date: date('date').notNull(),
  etoMm: decimal('eto_mm', { precision: 6, scale: 3 }),
  etoInches: decimal('eto_inches', { precision: 6, scale: 4 }),
  maxTempF: decimal('max_temp_f', { precision: 5, scale: 2 }),
  minTempF: decimal('min_temp_f', { precision: 5, scale: 2 }),
  avgTempF: decimal('avg_temp_f', { precision: 5, scale: 2 }),
  windSpeedMph: decimal('wind_speed_mph', { precision: 6, scale: 2 }),
  solarRadiation: decimal('solar_radiation', { precision: 8, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  stationDateUnq: unique().on(table.stationId, table.date),
  stationDateIdx: index('et_data_station_date_idx').on(table.stationId, table.date),
}));

export const weatherForecasts = pgTable('weather_forecasts', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  stationId: integer('station_id').notNull().references(() => cimisStations.id, { onDelete: 'cascade' }),
  forecastDate: date('forecast_date').notNull(),
  source: text('source').notNull().default('open_meteo'),
  etoInches: decimal('eto_inches', { precision: 6, scale: 4 }),
  maxTempF: decimal('max_temp_f', { precision: 5, scale: 2 }),
  minTempF: decimal('min_temp_f', { precision: 5, scale: 2 }),
  precipitationProbabilityPct: decimal('precipitation_probability_pct', { precision: 5, scale: 2 }),
  windSpeedMph: decimal('wind_speed_mph', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  stationForecastSourceUnq: unique().on(table.stationId, table.forecastDate, table.source),
  stationForecastDateIdx: index('weather_forecasts_station_date_idx').on(table.stationId, table.forecastDate),
}));

export const blockIrrigationConfig = pgTable('block_irrigation_config', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  blockId: uuid('block_id').notNull().unique().references(() => blocks.id, { onDelete: 'cascade' }),
  cimisStationId: integer('cimis_station_id').references(() => cimisStations.id),
  soilType: text('soil_type', { enum: ['sandy','sandy_loam','loam','clay_loam','clay'] }),
  emitterFlowGph: decimal('emitter_flow_gph', { precision: 6, scale: 3 }),
  emittersPerTree: integer('emitters_per_tree'),
  treeSpacingFt: decimal('tree_spacing_ft', { precision: 6, scale: 2 }),
  rowSpacingFt: decimal('row_spacing_ft', { precision: 6, scale: 2 }),
  deficitTriggerInches: decimal('deficit_trigger_inches', { precision: 4, scale: 2 }).default('1.5'),
  kcJan: decimal('kc_jan', { precision: 4, scale: 3 }), kcFeb: decimal('kc_feb', { precision: 4, scale: 3 }), kcMar: decimal('kc_mar', { precision: 4, scale: 3 }),
  kcApr: decimal('kc_apr', { precision: 4, scale: 3 }), kcMay: decimal('kc_may', { precision: 4, scale: 3 }), kcJun: decimal('kc_jun', { precision: 4, scale: 3 }),
  kcJul: decimal('kc_jul', { precision: 4, scale: 3 }), kcAug: decimal('kc_aug', { precision: 4, scale: 3 }), kcSep: decimal('kc_sep', { precision: 4, scale: 3 }),
  kcOct: decimal('kc_oct', { precision: 4, scale: 3 }), kcNov: decimal('kc_nov', { precision: 4, scale: 3 }), kcDec: decimal('kc_dec', { precision: 4, scale: 3 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const irrigationEvents = pgTable('irrigation_events', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledStartTime: text('scheduled_start_time'),
  plannedRuntimeHours: decimal('planned_runtime_hours', { precision: 5, scale: 2 }).notNull(),
  plannedFlowRateGpm: decimal('planned_flow_rate_gpm', { precision: 8, scale: 3 }),
  actualRuntimeHours: decimal('actual_runtime_hours', { precision: 5, scale: 2 }),
  actualFlowRateGpm: decimal('actual_flow_rate_gpm', { precision: 8, scale: 3 }),
  waterAppliedAcreInches: decimal('water_applied_acre_inches', { precision: 8, scale: 4 }),
  status: text('status', { enum: ['scheduled','running','completed','skipped','problem'] }).notNull().default('scheduled'),
  etDeficitInches: decimal('et_deficit_inches', { precision: 6, scale: 4 }),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  blockDateIdx: index('irrigation_events_block_date_idx').on(table.blockId, table.scheduledDate),
}));

export const frostAlertConfig = pgTable('frost_alert_config', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().unique().references(() => organizations.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(false),
  warningTempF: decimal('warning_temp_f', { precision: 4, scale: 1 }).default('34.0'),
  dangerTempF: decimal('danger_temp_f', { precision: 4, scale: 1 }).default('29.0'),
  monitorHours: jsonb('monitor_hours').default('{"start": 22, "end": 8}'),
  notifyProfiles: uuid('notify_profiles').array().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const pestSpecies = pgTable('pest_species', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es').notNull(),
  nameScientific: text('name_scientific'),
  category: text('category', { enum: ['insect','mite','disease','weed','vertebrate','beneficial'] }).notNull(),
  applicableCrops: text('applicable_crops').array().notNull(),
  actionThresholdDescription: text('action_threshold_description'),
  isAllowedInOrganic: boolean('is_allowed_in_organic').default(false),
  ucIpmUrl: text('uc_ipm_url'),
  isSystem: boolean('is_system').default(true),
});

export const scoutingLogs = pgTable('scouting_logs', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  scoutedBy: uuid('scouted_by').notNull().references(() => profiles.id),
  scoutedAt: timestamp('scouted_at', { withTimezone: true }).notNull().defaultNow(),
  pestSpeciesId: uuid('pest_species_id').references(() => pestSpecies.id),
  pestNameCustom: text('pest_name_custom'),
  rating: text('rating', { enum: ['none','low','moderate','high','action'] }),
  countPerSample: decimal('count_per_sample', { precision: 8, scale: 2 }),
  sampleCount: integer('sample_count'),
  observationNotes: text('observation_notes'),
  photoUrls: text('photo_urls').array().default(sql`'{}'`),
  gpsLat: decimal('gps_lat', { precision: 10, scale: 8 }),
  gpsLng: decimal('gps_lng', { precision: 11, scale: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  blockAtIdx: index('scouting_logs_block_at_idx').on(table.blockId, table.scoutedAt),
}));

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').references(() => blocks.id),
  ruleType: text('rule_type', { enum: ['et_deficit','flow_deviation','pest_threshold','temperature','frost'] }).notNull(),
  metric: text('metric').notNull(),
  operator: text('operator', { enum: ['>','<','>=','<=','='] }).notNull(),
  thresholdValue: decimal('threshold_value', { precision: 12, scale: 4 }).notNull(),
  notificationChannels: text('notification_channels').array().default(sql`ARRAY['push','email']`),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  cdmsId: text('cdms_id').unique(),
  epaRegNumber: text('epa_reg_number'),
  cdfaRegNumber: text('cdfa_reg_number'),
  dprProductId: text('dpr_product_id'),
  labelUrl: text('label_url'),
  productName: text('product_name').notNull(),
  manufacturer: text('manufacturer'),
  activeIngredients: jsonb('active_ingredients'),
  reiHours: integer('rei_hours'),
  phiDays: integer('phi_days'),
  formulation: text('formulation'),
  applicableCrops: text('applicable_crops').array(),
  targetPests: text('target_pests').array(),
  restrictedUse: boolean('restricted_use').default(false),
  isOmriListed: boolean('is_omri_listed').default(false),
  isCdfaOrganic: boolean('is_cdfa_organic').default(false),
  organicApprovedStates: text('organic_approved_states').array().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  nameIdx: index('products_name_idx').on(table.productName), // Simplified from ts_vector for now
  organicIdx: index('products_organic_idx').on(table.isOmriListed, table.isCdfaOrganic),
}));

export const productInventoryLinks = pgTable('product_inventory_links', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgProductUnq: unique('product_inventory_links_org_product_unq').on(table.orgId, table.productId),
  orgInventoryIdx: index('product_inventory_links_org_inventory_idx').on(table.orgId, table.inventoryItemId),
}));

export const applicationRecords = pgTable('application_records', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id),
  recordType: text('record_type', { enum: ['pesticide','fertilizer','soil_amendment'] }).notNull(),
  applicatorName: text('applicator_name').notNull(),
  applicatorLicense: text('applicator_license'),
  productId: uuid('product_id').references(() => products.id),
  productNameManual: text('product_name_manual'),
  epaRegNumber: text('epa_reg_number'),
  ratePerAcre: decimal('rate_per_acre', { precision: 10, scale: 4 }),
  rateUnit: text('rate_unit'),
  totalProductUsed: decimal('total_product_used', { precision: 10, scale: 4 }),
  totalProductUnit: text('total_product_unit'),
  waterVolumeGpa: decimal('water_volume_gpa', { precision: 8, scale: 2 }),
  appliedDate: date('applied_date').notNull(),
  appliedStartTime: text('applied_start_time'),
  appliedEndTime: text('applied_end_time'),
  windSpeedMph: decimal('wind_speed_mph', { precision: 5, scale: 2 }),
  windDirection: text('wind_direction'),
  tempF: decimal('temp_f', { precision: 5, scale: 2 }),
  targetPest: text('target_pest'),
  targetPestScoutingLogId: uuid('target_pest_scouting_log_id').references(() => scoutingLogs.id),
  sourceInventoryStockId: uuid('source_inventory_stock_id').references((): AnyPgColumn => inventoryStocks.id, { onDelete: 'set null' }),
  acresTreated: decimal('acres_treated', { precision: 10, scale: 2 }).notNull(),
  equipmentUsed: text('equipment_used'),
  reiExpiry: timestamp('rei_expiry', { withTimezone: true }),
  phiExpiry: date('phi_expiry'),
  isOrganicBlock: boolean('is_organic_block').notNull().default(false),
  omriConfirmed: boolean('omri_confirmed').default(false),
  certifierNotified: boolean('certifier_notified').default(false),
  verifiedBy: uuid('verified_by').references(() => profiles.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgDateIdx: index('app_records_org_date_idx').on(table.orgId, table.appliedDate),
  blockIdx: index('app_records_block_idx').on(table.blockId),
}));

export const harvestEvents = pgTable('harvest_events', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  blockSeasonId: uuid('block_season_id').references(() => blockSeasons.id),
  harvestDate: date('harvest_date').notNull(),
  harvestMethod: text('harvest_method', { enum: ['mechanical','hand','shake_catch'] }),
  totalPounds: decimal('total_pounds', { precision: 12, scale: 2 }),
  totalBins: integer('total_bins'),
  binWeightLbs: decimal('bin_weight_lbs', { precision: 8, scale: 2 }).default('1000'),
  pickerCount: integer('picker_count'),
  crewIds: uuid('crew_ids').array().default(sql`'{}'`),
  hulledWeightLbs: decimal('hulled_weight_lbs', { precision: 12, scale: 2 }),
  hullSplitPct: decimal('hull_split_pct', { precision: 5, scale: 2 }),
  brix: decimal('brix', { precision: 5, scale: 2 }),
  acidRatio: decimal('acid_ratio', { precision: 6, scale: 3 }),
  handlerName: text('handler_name'),
  loadTicket: text('load_ticket'),
  handlerTicketReconciled: boolean('handler_ticket_reconciled').default(false),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const crewMembers = pgTable('crew_members', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').references(() => profiles.id),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  employeeId: text('employee_id'),
  hireDate: date('hire_date'),
  position: text('position'),
  payType: text('pay_type', { enum: ['hourly','piece_rate','salary'] }),
  hourlyRate: decimal('hourly_rate', { precision: 8, scale: 2 }),
  h2aWorker: boolean('h2a_worker').default(false),
  h2aDisclaimerAcknowledged: boolean('h2a_disclaimer_acknowledged').default(false),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('crew_members_org_idx').on(table.orgId, table.active),
}));

export const laborEntries = pgTable('labor_entries', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  crewMemberId: uuid('crew_member_id').notNull().references(() => crewMembers.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id),
  blockId: uuid('block_id').references(() => blocks.id),
  workDate: date('work_date').notNull(),
  clockIn: timestamp('clock_in', { withTimezone: true }),
  clockOut: timestamp('clock_out', { withTimezone: true }),
  hoursWorked: decimal('hours_worked', { precision: 5, scale: 2 }),
  clockInGpsLat: decimal('clock_in_gps_lat', { precision: 10, scale: 8 }),
  clockInGpsLng: decimal('clock_in_gps_lng', { precision: 11, scale: 8 }),
  clockOutGpsLat: decimal('clock_out_gps_lat', { precision: 10, scale: 8 }),
  clockOutGpsLng: decimal('clock_out_gps_lng', { precision: 11, scale: 8 }),
  pieceRateType: text('piece_rate_type', { enum: ['bins','boxes','trees','lbs'] }),
  pieceRateQuantity: decimal('piece_rate_quantity', { precision: 10, scale: 2 }),
  pieceRatePerUnit: decimal('piece_rate_per_unit', { precision: 8, scale: 4 }),
  grossPay: decimal('gross_pay', { precision: 10, scale: 2 }),
  notes: text('notes'),
  approvedBy: uuid('approved_by').references(() => profiles.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  crewDateIdx: index('labor_entries_crew_date_idx').on(table.crewMemberId, table.workDate),
  orgDateIdx: index('labor_entries_org_date_idx').on(table.orgId, table.workDate),
}));

export const orgIntegrations = pgTable('org_integrations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  integrationType: text('integration_type', { enum: ['quickbooks','agworld','cdms'] }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  realmId: text('realm_id'),
  settings: jsonb('settings').default('{}'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  name: text('name').notNull(),
  category: text('category', {
    enum: ['fertilizer', 'pesticide', 'soil_amendment', 'fuel', 'irrigation', 'parts', 'packaging', 'tool', 'safety', 'other'],
  }).notNull().default('other'),
  unit: text('unit', {
    enum: ['gallon', 'quart', 'pound', 'ounce', 'ton', 'bag', 'case', 'each', 'foot', 'bin'],
  }).notNull().default('each'),
  manufacturer: text('manufacturer'),
  supplier: text('supplier'),
  description: text('description'),
  storageNotes: text('storage_notes'),
  reorderPoint: decimal('reorder_point', { precision: 12, scale: 2 }).notNull().default('0'),
  targetStock: decimal('target_stock', { precision: 12, scale: 2 }),
  defaultUnitCost: decimal('default_unit_cost', { precision: 12, scale: 2 }),
  lotTracking: boolean('lot_tracking').notNull().default(true),
  restrictedUse: boolean('restricted_use').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgCategoryIdx: index('inventory_items_org_category_idx').on(table.orgId, table.category, table.active),
  orgSkuUnq: unique('inventory_items_org_sku_unq').on(table.orgId, table.sku),
}));

export const inventoryLocations = pgTable('inventory_locations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  ranchId: uuid('ranch_id').references(() => ranches.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  code: text('code'),
  locationType: text('location_type', {
    enum: ['warehouse', 'shop', 'yard', 'field', 'vehicle', 'cold_storage', 'other'],
  }).notNull().default('warehouse'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgActiveIdx: index('inventory_locations_org_active_idx').on(table.orgId, table.active),
  ranchIdx: index('inventory_locations_ranch_idx').on(table.ranchId),
  orgCodeUnq: unique('inventory_locations_org_code_unq').on(table.orgId, table.code),
}));

export const inventoryStocks = pgTable('inventory_stocks', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => inventoryLocations.id, { onDelete: 'cascade' }),
  lotCode: text('lot_code'),
  expirationDate: date('expiration_date'),
  receivedDate: date('received_date'),
  quantityOnHand: decimal('quantity_on_hand', { precision: 12, scale: 2 }).notNull().default('0'),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }),
  vendorName: text('vendor_name'),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  lastMovementAt: timestamp('last_movement_at', { withTimezone: true }).defaultNow(),
  lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => profiles.id),
}, (table) => ({
  orgItemIdx: index('inventory_stocks_org_item_idx').on(table.orgId, table.itemId),
  locationIdx: index('inventory_stocks_location_idx').on(table.locationId),
  expirationIdx: index('inventory_stocks_expiration_idx').on(table.orgId, table.expirationDate),
}));

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  movementType: text('movement_type', {
    enum: ['purchase', 'transfer', 'usage', 'adjustment_in', 'adjustment_out', 'return', 'waste'],
  }).notNull(),
  fromStockId: uuid('from_stock_id').references(() => inventoryStocks.id, { onDelete: 'set null' }),
  toStockId: uuid('to_stock_id').references(() => inventoryStocks.id, { onDelete: 'set null' }),
  fromLocationId: uuid('from_location_id').references(() => inventoryLocations.id, { onDelete: 'set null' }),
  toLocationId: uuid('to_location_id').references(() => inventoryLocations.id, { onDelete: 'set null' }),
  blockId: uuid('block_id').references(() => blocks.id, { onDelete: 'set null' }),
  applicationRecordId: uuid('application_record_id').references(() => applicationRecords.id, { onDelete: 'set null' }),
  quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
  unitCost: decimal('unit_cost', { precision: 12, scale: 2 }),
  lotCode: text('lot_code'),
  expirationDate: date('expiration_date'),
  referenceNumber: text('reference_number'),
  vendorName: text('vendor_name'),
  notes: text('notes'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  performedBy: uuid('performed_by').notNull().references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgOccurredIdx: index('inventory_movements_org_occurred_idx').on(table.orgId, table.occurredAt),
  itemIdx: index('inventory_movements_item_idx').on(table.itemId),
  blockIdx: index('inventory_movements_block_idx').on(table.blockId),
  appRecordUnq: unique('inventory_movements_application_record_unq').on(table.applicationRecordId),
}));

export const degreeDayRecords = pgTable('degree_day_records', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  cimisStationId: integer('cimis_station_id').notNull().references(() => cimisStations.id),
  pestModel: text('pest_model').notNull(), // 'NOW', 'PTB', 'CITRUS_THRIPS', 'ACP'
  date: date('date').notNull(),
  dailyDd: decimal('daily_dd', { precision: 8, scale: 4 }),
  cumulativeDd: decimal('cumulative_dd', { precision: 10, scale: 4 }),
  biofixDate: date('biofix_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueConstraint: unique().on(table.cimisStationId, table.pestModel, table.date),
  stationModelIdx: index('dd_records_station_model_idx').on(table.cimisStationId, table.pestModel, table.date),
}));

export const aiRecommendations = pgTable('ai_recommendations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  blockId: uuid('block_id').notNull().references(() => blocks.id, { onDelete: 'cascade' }),
  recommendationType: text('recommendation_type', { enum: ['irrigation','pest_action','harvest_timing','hull_split','general'] }).notNull(),
  titleEn: text('title_en').notNull(),
  titleEs: text('title_es').notNull(),
  bodyEn: text('body_en').notNull(),
  bodyEs: text('body_es').notNull(),
  urgency: text('urgency', { enum: ['info','suggestion','warning','urgent'] }),
  dataInputs: jsonb('data_inputs'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  actedOnAt: timestamp('acted_on_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgBlockIdx: index('ai_recs_org_block_idx').on(table.orgId, table.blockId, table.createdAt),
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  recommendationId: uuid('recommendation_id').references(() => aiRecommendations.id, { onDelete: 'cascade' }),
  notificationType: text('notification_type', { enum: ['forecast_recommendation', 'frost_alert'] }).notNull(),
  titleEn: text('title_en').notNull(),
  titleEs: text('title_es').notNull(),
  bodyEn: text('body_en').notNull(),
  bodyEs: text('body_es').notNull(),
  urgency: text('urgency', { enum: ['info','suggestion','warning','urgent'] }),
  sourceCategory: text('source_category', { enum: ['tasks','pest','irrigation','compliance','seasonal'] }).notNull().default('seasonal'),
  metadata: jsonb('metadata'),
  readAt: timestamp('read_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgCreatedIdx: index('notifications_org_created_idx').on(table.orgId, table.createdAt),
  orgUnreadIdx: index('notifications_org_unread_idx').on(table.orgId, table.readAt, table.archivedAt),
  recommendationUnq: unique().on(table.recommendationId),
}));

export const notificationSettings = pgTable('notification_settings', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().unique().references(() => organizations.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  urgentOnly: boolean('urgent_only').notNull().default(true),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(true),
  quietHoursStart: text('quiet_hours_start').notNull().default('21:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('06:00'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdIdx: index('notification_settings_org_id_idx').on(table.orgId),
}));

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  notificationId: uuid('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['push', 'email'] }).notNull().default('push'),
  status: text('status', { enum: ['pending', 'deferred', 'sent', 'failed', 'canceled'] }).notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  providerMessageId: text('provider_message_id'),
  receiptCheckedAt: timestamp('receipt_checked_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  reason: text('reason'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgStatusScheduledIdx: index('notification_deliveries_org_status_scheduled_idx').on(table.orgId, table.status, table.scheduledFor),
  profileStatusIdx: index('notification_deliveries_profile_status_idx').on(table.profileId, table.status),
  deliveryUnique: unique('notification_deliveries_notification_profile_channel_unq').on(
    table.notificationId,
    table.profileId,
    table.channel,
  ),
}));

export const agworldSyncLog = pgTable('agworld_sync_log', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  syncType: text('sync_type', { enum: ['spray_record','scout_log','block','recommendation'] }).notNull(),
  agworldId: text('agworld_id'),
  ranchosId: uuid('ranchos_id'),
  direction: text('direction', { enum: ['push','pull'] }),
  status: text('status', { enum: ['success','failed','conflict'] }),
  errorMessage: text('error_message'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').unique().notNull(),
  name: text('name').notNull(),
  scopes: text('scopes').array().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const handlerTicketImports = pgTable('handler_ticket_imports', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  harvestEventId: uuid('harvest_event_id').references(() => harvestEvents.id),
  importDate: timestamp('import_date', { withTimezone: true }).notNull(),
  handlerName: text('handler_name').notNull(),
  loadTicket: text('load_ticket').notNull(),
  ticketDate: date('ticket_date'),
  netPounds: decimal('net_pounds', { precision: 12, scale: 2 }),
  grossPounds: decimal('gross_pounds', { precision: 12, scale: 2 }),
  moisturePct: decimal('moisture_pct', { precision: 5, scale: 2 }),
  hulledWeightLbs: decimal('hulled_weight_lbs', { precision: 12, scale: 2 }),
  pricePerPound: decimal('price_per_pound', { precision: 8, scale: 4 }),
  grossValue: decimal('gross_value', { precision: 12, scale: 2 }),
  status: text('status', { enum: ['unmatched','matched','discrepancy'] }).default('unmatched'),
  discrepancyNotes: text('discrepancy_notes'),
  importedBy: uuid('imported_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
