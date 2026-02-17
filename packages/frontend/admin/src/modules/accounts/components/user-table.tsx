import { ImportStatus, type ParsedUser } from '../utils/csv-utils';

interface UserTableProps {
  users: ParsedUser[];
}

/**
 * Displays a table of users with their import status
 */
export const UserTable: React.FC<UserTableProps> = ({ users }) => {
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border/60 bg-card shadow-sm">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-muted/40">
          <tr>
            <th className="border-b border-border px-4 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground">
              Name
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground">
              Email
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground">
              Password
            </th>
            <th className="border-b border-border px-4 py-2 text-left text-xs font-medium tracking-wider text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((user, index) => (
            <tr
              key={`${user.email}-${index}`}
              className={`${user.valid === false ? 'bg-destructive/10' : ''}
                ${user.importStatus === ImportStatus.Failed ? 'bg-destructive/10' : ''}
                ${user.importStatus === ImportStatus.Success ? 'bg-[var(--affine-v2-layer-background-success)]' : ''}
                ${user.importStatus === ImportStatus.Processing ? 'bg-[var(--affine-v2-layer-background-warning)]' : ''}`}
            >
              <td className="max-w-[150px] truncate px-4 py-2 text-sm text-foreground">
                {user.name || '-'}
              </td>
              <td
                className={`py-2 px-4 text-sm truncate max-w-[200px] ${
                  user.valid === false &&
                  (user.error?.toLowerCase().includes('email') ||
                    !user.error?.toLowerCase().includes('password'))
                    ? 'text-destructive'
                    : 'text-foreground'
                }`}
              >
                {user.email}
              </td>
              <td
                className={`py-2 px-4 text-sm truncate max-w-[150px] ${
                  user.valid === false &&
                  user.error?.toLowerCase().includes('password')
                    ? 'text-destructive'
                    : 'text-foreground'
                }`}
              >
                {user.password || '-'}
              </td>
              <td className="py-2 px-4 text-sm">
                {user.importStatus === ImportStatus.Success ? (
                  <span className="text-foreground">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--affine-v2-status-success)]" />
                    Success
                  </span>
                ) : user.importStatus === ImportStatus.Failed ? (
                  <span className="text-destructive" title={user.importError}>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-destructive" />
                    Failed ({user.importError})
                  </span>
                ) : user.importStatus === ImportStatus.Processing ? (
                  <span className="text-primary">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" />
                    Processing...
                  </span>
                ) : user.valid === false ? (
                  <span className="text-destructive" title={user.error}>
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-destructive" />
                    Invalid ({user.error})
                  </span>
                ) : (
                  <span className="text-foreground">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-foreground" />
                    Valid
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
