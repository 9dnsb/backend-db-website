export const isAdminUIOnly = ({ req }: { req: { user: { role?: string } | null } }) => {
  return req.user?.role === 'admin'
}
