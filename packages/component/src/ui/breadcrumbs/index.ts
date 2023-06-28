import type { BreadcrumbsProps } from '@mui/material/Breadcrumbs';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import type { ComponentType } from 'react';

import { styled } from '../../styles';

const StyledMuiBreadcrumbs = styled(MuiBreadcrumbs)(() => {
  return {
    color: 'var(--affine-text-primary-color)',
  };
});

export const Breadcrumbs: ComponentType<BreadcrumbsProps> =
  StyledMuiBreadcrumbs;
