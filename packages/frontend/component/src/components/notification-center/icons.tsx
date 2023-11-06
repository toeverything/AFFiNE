import type { SVGProps } from 'react';

export const SuccessIcon = ({
  width = 24,
  height = 24,
}: SVGProps<SVGElement>) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 21.5C17.2467 21.5 21.5 17.2467 21.5 12C21.5 6.75329 17.2467 2.5 12 2.5C6.75329 2.5 2.5 6.75329 2.5 12C2.5 17.2467 6.75329 21.5 12 21.5ZM16.2247 9.36363C16.5176 9.07073 16.5176 8.59586 16.2247 8.30296C15.9318 8.01007 15.4569 8.01007 15.164 8.30296L9.88882 13.5782L8.30804 11.9974C8.01515 11.7045 7.54027 11.7045 7.24738 11.9974C6.95449 12.2903 6.95449 12.7652 7.24738 13.0581L9.35849 15.1692C9.65138 15.4621 10.1263 15.4621 10.4192 15.1692L16.2247 9.36363Z"
        fill="currentColor"
      />
    </svg>
  );
};
