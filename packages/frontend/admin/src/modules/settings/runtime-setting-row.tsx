import { type ReactNode } from 'react';

export const RuntimeSettingRow = ({
  id,
  description,
  lastUpdatedTime,
  operation,
  children,
}: {
  id: string;
  description: string;
  lastUpdatedTime: string;
  operation: ReactNode;
  children: ReactNode;
}) => {
  const formatTime = new Date(lastUpdatedTime).toLocaleString();
  return (
    <div
      className="flex justify-between flex-grow overflow-y-auto space-y-[10px] gap-5"
      id={id}
    >
      <div className="flex flex-col gap-1">
        <div className="text-base font-bold">{description}</div>
        <div className="">
          <code className="text-xs  bg-zinc-100 text-gray-500 px-[4px] py-[2px] rounded">
            {id}
          </code>
        </div>
        <div className="text-xs text-gray-500">
          last updated at: {formatTime}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 mr-1">
        {operation}
        {children}
      </div>
    </div>
  );
};
