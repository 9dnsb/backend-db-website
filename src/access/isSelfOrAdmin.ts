import type { Access } from 'payload'

export const isSelfOrAdmin: Access = ({ req, id }) => {
  return req.user?.role === 'admin' || req.user?.id === id
}
