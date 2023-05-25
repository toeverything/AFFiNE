import { styled } from '@affine/component';

export const StyledModalWrapper = styled('div')(() => {
  return {
    position: 'relative',
    padding: '0px',
    width: '560px',
    background: 'var(--affine-white)',
    borderRadius: '12px',
    // height: '312px',
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    margin: '44px 0px 12px 0px',
    width: '560px',
    fontWeight: '600',
    fontSize: '20px;',
    textAlign: 'center',
  };
});

// export const StyledModalContent = styled('div')(({ theme }) => {});

export const StyledTextContent = styled('div')(() => {
  return {
    margin: 'auto',
    width: '425px',
    fontFamily: 'Avenir Next',
    fontStyle: 'normal',
    fontWeight: '400',
    fontSize: '18px',
    lineHeight: '26px',
    textAlign: 'left',
  };
});

export const StyledInputContent = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: '24px 0',
    fontSize: 'var(--affine-font-base)',
  };
});

export const StyledButtonContent = styled('div')(() => {
  return {
    marginBottom: '42px',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
  };
});

export const StyledWorkspaceName = styled('span')(() => {
  return {
    fontWeight: '600',
  };
});

// export const StyledCancelButton = styled(Button)(({ theme }) => {
//   return {
//     width: '100px',
//     justifyContent: 'center',
//   };
// });

// export const StyledDeleteButton = styled(Button)(({ theme }) => {
//   return {
//     width: '100px',
//     justifyContent: 'center',
//   };
// });
