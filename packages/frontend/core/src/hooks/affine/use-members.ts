import type { GetMembersByWorkspaceIdQuery } from '@affine/graphql';
import { getMembersByWorkspaceIdQuery, Permission } from '@affine/graphql';
import { useMemo } from 'react';

import { useQuery } from '../use-query';

export function calculateWeight(member: Member) {
  const permissionWeight = {
    [Permission.Owner]: 4,
    [Permission.Admin]: 3,
    [Permission.Write]: 2,
    [Permission.Read]: 1,
  };

  const factors = [
    Number(member.permission === Permission.Owner), // Owner weight is the highest
    Number(!member.accepted), // Unaccepted members are before accepted members
    permissionWeight[member.permission] || 0,
  ];

  return factors.reduce((ret, factor, index, arr) => {
    return ret + factor * Math.pow(10, arr.length - 1 - index);
  }, 0);
}

export type Member = Omit<
  GetMembersByWorkspaceIdQuery['workspace']['members'][number],
  '__typename'
>;
export function useMembers(
  workspaceId: string,
  skip: number,
  take: number = 8
) {
  const { data } = useQuery({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId,
      skip,
      take,
    },
  });

  const members = data.workspace.members;

  return useMemo(() => {
    // sort members by weight
    return members.sort((a, b) => {
      const weightDifference = calculateWeight(b) - calculateWeight(a);
      if (weightDifference !== 0) {
        return weightDifference;
      }
      // if weight is the same, sort by name
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [members]);
}
