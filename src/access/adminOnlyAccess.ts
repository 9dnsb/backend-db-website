import type { CollectionConfig } from 'payload'
import { isAdmin } from './isAdmin'
import { isAdminUIOnly } from './isAdminUIOnly'

export const adminOnlyAccess: CollectionConfig['access'] = {
  read: () => true,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
  admin: isAdminUIOnly,
}
