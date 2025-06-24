import { ImportStatus, type ParsedUser } from '../utils/csv-utils';

interface UserTableProps {
  users: ParsedUser[];
}

/**
 * Displays a table of users with their import status
 */
export const UserTable: React.FC<UserTableProps> = ({ users }) => {
  return (
    <div className="max-h-[300px] overflow-y-auto border rounded-md">
      <table className="w-full border-collapse">
        <thead className="bg-white sticky top-0">
          <tr>
            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 tracking-wider ">
              Name
            </th>
            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 tracking-wider">
              Email
            </th>
            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 tracking-wider">
              Password
            </th>
            <th className="py-2 px-4 border-b text-left text-xs font-medium text-gray-500 tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((user, index) => (
            <tr
              key={`${user.email}-${index}`}
              className={`${user.valid === false ? 'bg-red-50' : ''}
                ${user.importStatus === ImportStatus.Failed ? 'bg-red-50' : ''}
                ${user.importStatus === ImportStatus.Success ? 'bg-green-50' : ''}
                ${user.importStatus === ImportStatus.Processing ? 'bg-yellow-50' : ''}`}
            >
              <td className="py-2 px-4 text-sm text-gray-900 truncate max-w-[150px]">
                {user.name || '-'}
              </td>
              <td
                className={`py-2 px-4 text-sm truncate max-w-[200px] ${
                  user.valid === false &&
                  (user.error?.toLowerCase().includes('email') ||
                    !user.error?.toLowerCase().includes('password'))
                    ? 'text-red-500'
                    : 'text-gray-900'
                }`}
              >
                {user.email}
              </td>
              <td
                className={`py-2 px-4 text-sm truncate max-w-[150px] ${
                  user.valid === false &&
                  user.error?.toLowerCase().includes('password')
                    ? 'text-red-500'
                    : 'text-gray-900'
                }`}
              >
                {user.password || '-'}
              </td>
              <td className="py-2 px-4 text-sm">
                {user.importStatus === ImportStatus.Success ? (
                  <span className="text-gray-900">
                    <span className="h-2 w-2 bg-gray-900 rounded-full inline-block mr-2" />
                    Success
                  </span>
                ) : user.importStatus === ImportStatus.Failed ? (
                  <span className="text-red-500" title={user.importError}>
                    <span className="h-2 w-2 bg-red-500 rounded-full inline-block mr-2" />
                    Failed ({user.importError})
                  </span>
                ) : user.importStatus === ImportStatus.Processing ? (
                  <span className="text-yellow-500">
                    <span className="h-2 w-2 bg-yellow-500 rounded-full inline-block mr-2" />
                    Processing...
                  </span>
                ) : user.valid === false ? (
                  <span className="text-red-500" title={user.error}>
                    <span className="h-2 w-2 bg-red-500 rounded-full inline-block mr-2" />
                    Invalid ({user.error})
                  </span>
                ) : (
                  <span className="text-gray-900">
                    <span className="h-2 w-2 bg-gray-900 rounded-full inline-block mr-2" />
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
