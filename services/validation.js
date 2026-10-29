const { z } = require('zod');

const booleanish = z.preprocess(value => {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return value;
}, z.boolean());

// 前端编辑表单会把数据库中的 NULL 原样回传，这里视为“字段未填写/未修改”。
const nullToUndefined = value => (value === null ? undefined : value);
const optionalText = (max = 500) => z.preprocess(nullToUndefined, z.string().trim().max(max).optional());
const secretText = (max = 4096) => z.preprocess(nullToUndefined, z.string().trim().max(max).optional());

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(72)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, '密码长度不能超过 72 字节')
});

const keyCreateSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  display_name: z.string().trim().min(1).max(160),
  api_key: z.string().trim().min(1).max(4096),
  base_url: optionalText(500),
  access_key_id: optionalText(256),
  secret_access_key: secretText(1024),
  organization_id: optionalText(200),
  project_id: optionalText(200),
  team: z.string().trim().min(1).max(120),
  owner: z.string().trim().min(1).max(120),
  member_count: z.coerce.number().int().min(0).max(1000000).optional(),
  sort_order: z.coerce.number().int().min(0).max(1000000).optional(),
  enabled: booleanish.optional(),
  sub2api_account_id: z.coerce.number().int().positive().nullable().optional(),
  sub2api_groups: optionalText(2000),
  public_schedule_control: booleanish.optional(),
  public_recover_control: booleanish.optional(),
  admin_locked: booleanish.optional()
});

const keyUpdateSchema = keyCreateSchema.partial().extend({
  api_key: z.string().trim().max(4096).optional()
});

const settingsSchema = z.object({
  site_title: z.string().trim().min(1).max(120).optional(),
  site_description: z.string().max(300).optional(),
  site_icon: z.string().trim().max(500).optional(),
  announcement: z.string().max(5000).optional(),
  refresh_interval: z.coerce.number().int().min(60).max(86400).optional(),
  theme_mode: z.enum(['light', 'dark', 'auto']).optional(),
  theme_palette: z.enum(['teal', 'zinc', 'slate']).optional(),
  font_family: z.enum(['jinkai', 'system']).optional(),
  font_weight: z.enum(['normal', 'medium', 'bold']).optional(),
  visible_fields: z.record(z.string(), z.boolean()).optional(),
  sub2api_url: z.string().trim().max(500).optional(),
  sub2api_sync_interval: z.coerce.number().int().min(60).max(86400).optional(),
  sub2api_admin_api_key: secretText(4096),
  sub2api_control_api_key: secretText(4096),
  sub2api_admin_api_key_clear: booleanish.optional(),
  sub2api_control_api_key_clear: booleanish.optional()
});

const passwordSchema = z.object({
  current_password: z.string().min(1).max(72),
  new_password: z.string().min(12).max(72)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, '新密码 UTF-8 长度不能超过 72 字节')
});

const reorderSchema = z.object({
  order: z.array(z.coerce.number().int().positive()).min(1).max(1000)
});

const importAccountsSchema = z.object({
  accounts: z.array(z.object({
    sub2api_account_id: z.coerce.number().int().positive(),
    enabled: booleanish
  })).min(1).max(500)
});

const publicScheduleSchema = z.object({
  token: z.string().min(20).max(4096),
  schedulable: z.boolean(),
  expectedState: z.boolean().optional()
});

const publicRecoverSchema = z.object({
  token: z.string().min(20).max(4096),
  expectedStatus: z.string().max(80).optional()
});

module.exports = {
  loginSchema,
  keyCreateSchema,
  keyUpdateSchema,
  settingsSchema,
  passwordSchema,
  reorderSchema,
  importAccountsSchema,
  publicScheduleSchema,
  publicRecoverSchema
};
