import { Box, Skeleton, Typography } from '@mui/material';

export const EditorSkeleton = () => {
  return (
    <>
      <Box
        sx={{
          marginTop: '60px',
        }}
      />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            maxWidth: '686px',
            width: '100%',
          }}
        >
          <Typography variant="h1">
            <Skeleton />
          </Typography>
          <Skeleton animation="wave" />
          <Skeleton animation="wave" />
          <Skeleton animation="wave" />
          <Skeleton animation="wave" />
          <Skeleton animation="wave" />
          <Skeleton animation="wave" width="70%" />
        </Box>
      </Box>
    </>
  );
};
