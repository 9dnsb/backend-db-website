import type { Access } from 'payload'

export const isAdmin: Access = ({ req }) => {
  return !!req.user && req.user.role === 'admin'
}
